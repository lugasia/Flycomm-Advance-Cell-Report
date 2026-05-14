#!/usr/bin/env python3
"""
ClickHouse Proxy Server with ML Coverage Analysis
Bypasses CORS restrictions for browser-based ClickHouse connections
Includes Random Forest / Isolation Forest for cell coverage anomaly detection
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import urllib.request
import urllib.error
import urllib.parse
import ssl
import base64
import os
import math
import time
import datetime

# Try to import ML libraries (optional)
try:
    import numpy as np
    from sklearn.ensemble import IsolationForest, RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("[Warning] scikit-learn not installed. ML features disabled.")
    print("         Install with: pip install scikit-learn numpy")

# ClickHouse connection settings (can be overridden by environment variables)
CH_HOST = os.environ.get('CH_HOST', 'vusqo3wrfh.us-east-2.aws.clickhouse.cloud')
CH_PORT = os.environ.get('CH_PORT', '443')
CH_USER = os.environ.get('CH_USER', '')
CH_PASS = os.environ.get('CH_PASS', '')

# In-memory cache for /query/cell-footprint (TTL = 300s)
_FOOTPRINT_CACHE = {}
_FOOTPRINT_TTL_SECONDS = 300

class ProxyHandler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        """Handle POST requests - proxy to ClickHouse or serve files"""
        if self.path == '/query':
            self.handle_query()
        elif self.path == '/ml/coverage':
            self.handle_coverage_analysis()
        elif self.path == '/query/cell-footprint':
            self.handle_cell_footprint()
        else:
            self.send_error(404, 'Not Found')

    def do_GET(self):
        """Serve static files"""
        # Serve index.html for root
        if self.path == '/':
            self.path = '/index.html'
        return SimpleHTTPRequestHandler.do_GET(self)

    def send_cors_headers(self):
        """Add CORS headers to response"""
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def handle_query(self):
        """Proxy query to ClickHouse"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            query = data.get('query', '')
            host = data.get('host', CH_HOST)
            database = data.get('database', 'default')
            user = data.get('user', CH_USER)
            password = data.get('password', CH_PASS)

            if not query:
                self.send_json_error('No query provided')
                return

            if not user or not password:
                self.send_json_error('Missing credentials')
                return

            # Build ClickHouse URL with performance settings
            url = f'https://{host}/?database={database}&default_format=JSON'

            # Create request
            req = urllib.request.Request(url, data=query.encode('utf-8'), method='POST')

            # Add auth header
            auth_string = base64.b64encode(f'{user}:{password}'.encode()).decode()
            req.add_header('Authorization', f'Basic {auth_string}')
            req.add_header('Content-Type', 'text/plain')
            req.add_header('Accept-Encoding', 'gzip, deflate')

            # Create SSL context (allow self-signed certs if needed)
            ctx = ssl.create_default_context()

            # Execute request
            with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
                result = response.read().decode('utf-8')

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(result.encode('utf-8'))

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8') if e.fp else str(e)
            self.send_json_error(f'ClickHouse error: {error_body}', e.code)
        except urllib.error.URLError as e:
            self.send_json_error(f'Connection error: {str(e.reason)}')
        except json.JSONDecodeError as e:
            self.send_json_error(f'Invalid JSON: {str(e)}')
        except Exception as e:
            self.send_json_error(f'Server error: {str(e)}')

    def handle_coverage_analysis(self):
        """Analyze cell coverage using RSRP-based Random Forest classification"""
        if not ML_AVAILABLE:
            self.send_json_error('ML libraries not installed. Run: pip install scikit-learn numpy')
            return

        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            cells = data.get('cells', [])
            if len(cells) < 5:
                self.send_json_error('Need at least 5 data points for analysis')
                return

            # Extract features for ML - now including RSRP
            features = []
            cell_info = []
            has_rsrp = False

            for cell in cells:
                lat = float(cell.get('latitude', 0))
                lon = float(cell.get('longitude', 0))
                samples = int(cell.get('samples', cell.get('counted', 1)))
                enb = cell.get('cell_enb', '')
                eci = cell.get('cell_eci', '')
                mcc = cell.get('network_mcc', '')
                mnc = cell.get('network_mnc', '')

                # RSRP values (can be avg, min, max)
                avg_rsrp = cell.get('avg_rsrp')
                min_rsrp = cell.get('min_rsrp')
                max_rsrp = cell.get('max_rsrp')

                # Use avg_rsrp if available, otherwise try to get any RSRP value
                rsrp = None
                if avg_rsrp is not None and avg_rsrp != '':
                    try:
                        rsrp = float(avg_rsrp)
                        has_rsrp = True
                    except (ValueError, TypeError):
                        pass

                enb_num = int(enb) if enb and str(enb).isdigit() else 0
                eci_num = int(eci) if eci and str(eci).isdigit() else 0

                # Feature engineering with RSRP
                feature_row = [
                    lat,
                    lon,
                    math.log1p(samples),
                    enb_num % 1000,
                    eci_num % 256,
                ]

                # Add RSRP as feature if available
                if rsrp is not None:
                    feature_row.append(rsrp)
                else:
                    feature_row.append(-100)  # Default RSRP if not available

                features.append(feature_row)

                cell_info.append({
                    'lat': lat,
                    'lon': lon,
                    'enb': enb,
                    'eci': eci,
                    'samples': samples,
                    'mcc': mcc,
                    'mnc': mnc,
                    'avg_rsrp': rsrp,
                    'min_rsrp': float(min_rsrp) if min_rsrp else None,
                    'max_rsrp': float(max_rsrp) if max_rsrp else None,
                })

            # Convert to numpy array
            X = np.array(features)

            # Normalize features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            # RSRP-based coverage classification
            # Excellent: > -80 dBm, Good: -80 to -90, Fair: -90 to -100, Poor: -100 to -110, Bad: < -110
            def classify_rsrp(rsrp):
                if rsrp is None:
                    return 2  # Fair (unknown)
                if rsrp > -80:
                    return 4  # Excellent
                elif rsrp > -90:
                    return 3  # Good
                elif rsrp > -100:
                    return 2  # Fair
                elif rsrp > -110:
                    return 1  # Poor
                else:
                    return 0  # Bad

            # Create labels based on RSRP if available
            if has_rsrp:
                y_labels = np.array([classify_rsrp(c['avg_rsrp']) for c in cell_info])
            else:
                # Fallback to sample-based classification
                median_samples = np.median([c['samples'] for c in cell_info])
                y_labels = np.array([3 if c['samples'] >= median_samples else 1 for c in cell_info])

            # Train Random Forest for coverage prediction
            rf = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )

            # Need at least 2 classes for RF
            unique_labels = np.unique(y_labels)
            if len(unique_labels) < 2:
                # Add dummy variation
                y_labels[0] = (y_labels[0] + 1) % 5

            rf.fit(X_scaled, y_labels)

            # Get predictions
            predictions = rf.predict(X_scaled)
            proba = rf.predict_proba(X_scaled)
            confidence = np.max(proba, axis=1)

            # Coverage level mapping
            coverage_levels = {
                0: {'level': 'bad', 'color': '#dc2626', 'label': 'Bad (< -110 dBm)'},
                1: {'level': 'poor', 'color': '#f97316', 'label': 'Poor (-110 to -100 dBm)'},
                2: {'level': 'fair', 'color': '#eab308', 'label': 'Fair (-100 to -90 dBm)'},
                3: {'level': 'good', 'color': '#84cc16', 'label': 'Good (-90 to -80 dBm)'},
                4: {'level': 'excellent', 'color': '#22c55e', 'label': 'Excellent (> -80 dBm)'},
            }

            # Build results
            results = []
            coverage_stats = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}

            for i, cell in enumerate(cell_info):
                pred_class = int(predictions[i])
                coverage_info = coverage_levels.get(pred_class, coverage_levels[2])
                coverage_stats[pred_class] += 1

                # Calculate coverage score (0-100, higher = better coverage)
                rsrp = cell.get('avg_rsrp')
                if rsrp is not None:
                    # Map RSRP (-140 to -40) to score (0 to 100)
                    coverage_score = int(max(0, min(100, (rsrp + 140) * 100 / 100)))
                else:
                    coverage_score = pred_class * 25  # Fallback based on prediction

                results.append({
                    'lat': cell['lat'],
                    'lon': cell['lon'],
                    'enb': cell['enb'],
                    'eci': cell['eci'],
                    'samples': cell['samples'],
                    'mcc': cell['mcc'],
                    'mnc': cell['mnc'],
                    'avg_rsrp': cell['avg_rsrp'],
                    'min_rsrp': cell['min_rsrp'],
                    'max_rsrp': cell['max_rsrp'],
                    'coverage_level': coverage_info['level'],
                    'coverage_color': coverage_info['color'],
                    'coverage_label': coverage_info['label'],
                    'coverage_score': coverage_score,
                    'confidence': float(confidence[i]),
                })

            # Sort by coverage score (worst coverage first for attention)
            results.sort(key=lambda x: x['coverage_score'])

            response = {
                'success': True,
                'total_cells': len(cells),
                'has_rsrp': has_rsrp,
                'coverage_stats': {
                    'excellent': coverage_stats[4],
                    'good': coverage_stats[3],
                    'fair': coverage_stats[2],
                    'poor': coverage_stats[1],
                    'bad': coverage_stats[0],
                },
                'model': 'RandomForest + RSRP Coverage',
                'results': results
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            self.send_json_error(f'ML analysis error: {str(e)}')

    # ─── Cell Footprint endpoint ──────────────────────────────────────────
    def handle_cell_footprint(self):
        """Aggregate measurements into H3 hexes for one or more cells."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            ch = data.get('ch') or {}
            host = ch.get('host') or data.get('host') or CH_HOST
            port = str(ch.get('port') or data.get('port') or '443')
            user = ch.get('user') or data.get('user') or CH_USER
            password = ch.get('password') or data.get('password') or CH_PASS
            database = ch.get('database') or data.get('database') or 'default'

            if not host or not user or not password:
                self.send_json_error('Missing ClickHouse credentials', 400)
                return

            ecgis_in = [str(e).strip() for e in (data.get('ecgis') or []) if str(e).strip()]
            ecis_in = [int(e) for e in (data.get('ecis') or []) if str(e).strip().lstrip('-').isdigit()]
            enbs_in = [int(e) for e in (data.get('enbs') or []) if str(e).strip().lstrip('-').isdigit()]
            plmn = (data.get('plmn') or '').strip()
            hours = max(1, int(data.get('hours') or 168))
            h3_resolution = data.get('h3_resolution')
            min_samples = max(1, int(data.get('min_samples_per_hex') or 3))
            metric = data.get('metric') or 'p50_rsrp'
            result_limit = max(1, int(data.get('result_limit') or 50000))

            if (ecis_in or enbs_in) and not plmn:
                self.send_json_error('PLMN required for ECI/eNB inputs', 400)
                return

            # ─── Identifier normalisation: ECI/eNB + PLMN → ECGI ───
            ecgis = list(ecgis_in)
            ambiguous = []
            if ecis_in or enbs_in:
                clauses = []
                if ecis_in:
                    clauses.append('cell_eci IN (' + ','.join(str(e) for e in ecis_in) + ')')
                if enbs_in:
                    clauses.append('cell_enb IN (' + ','.join(str(e) for e in enbs_in) + ')')
                esc_plmn = plmn.replace("'", "''")
                lookup_cutoff = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S')
                lookup_sql = (
                    "SELECT DISTINCT cell_ecgi, cell_eci, cell_enb FROM measurements_year_geo "
                    f"WHERE ({' OR '.join(clauses)}) "
                    f"AND network_PLMN = '{esc_plmn}' "
                    "AND timestamp >= {cutoff:DateTime} "
                    "AND toDate(timestamp) >= toDate({cutoff:DateTime}) "
                    "AND cell_ecgi IS NOT NULL AND cell_ecgi != '' "
                    "LIMIT 500 FORMAT JSON"
                )
                lookup = self._ch_query(
                    host, port, database, user, password, lookup_sql,
                    params={'cutoff': lookup_cutoff}
                )
                seen = set(ecgis)
                eci_to_ecgi = {}
                for r in lookup.get('data', []):
                    ecgi = str(r.get('cell_ecgi') or '').strip()
                    eci = r.get('cell_eci')
                    if ecgi and ecgi not in seen:
                        ecgis.append(ecgi)
                        seen.add(ecgi)
                    if eci is not None and ecgi:
                        eci_to_ecgi.setdefault(str(eci), []).append(ecgi)
                for eci_key, mapped in eci_to_ecgi.items():
                    uniq = list(dict.fromkeys(mapped))
                    if len(uniq) > 1:
                        ambiguous.append({'eci': eci_key, 'ecgis': uniq})

            if not ecgis:
                self._json_response({
                    'ok': True,
                    'ecgi_resolved': [],
                    'h3_resolution': None,
                    'total_samples': 0,
                    'total_hexes': 0,
                    'time_window_hours': hours,
                    'metric': metric,
                    'hexes': [],
                    'ambiguous_inputs': ambiguous,
                    'message': 'No ECGIs resolved from inputs.'
                })
                return

            # ─── Cache lookup ───
            cache_key = '|'.join([
                ','.join(sorted(ecgis)),
                str(hours),
                str(h3_resolution),
                str(min_samples),
                str(result_limit),
            ])
            now_ts = time.monotonic()
            cached = _FOOTPRINT_CACHE.get(cache_key)
            if cached and cached['ts'] + _FOOTPRINT_TTL_SECONDS > now_ts:
                self._json_response(cached['data'])
                return

            ecgi_array_literal = '[' + ','.join(
                "'" + e.replace("'", "''") + "'" for e in ecgis
            ) + ']'

            # Pre-compute the cutoff as a literal so the partition pruner can
            # treat it as a constant. now() - INTERVAL X HOUR sometimes confuses
            # the analyser and the full table gets read.
            cutoff = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=hours)
            cutoff_str = cutoff.strftime('%Y-%m-%d %H:%M:%S')

            # ─── Adaptive H3 resolution ───
            chosen_res = h3_resolution
            pre_count = None
            if chosen_res is None:
                count_sql = (
                    "SELECT count() AS n FROM measurements_year_geo "
                    "WHERE timestamp >= {cutoff:DateTime} "
                    "AND toDate(timestamp) >= toDate({cutoff:DateTime}) "
                    "AND (cell_ecgi IN {ecgis:Array(String)} OR cell_cgi IN {ecgis:Array(String)}) "
                    "AND signal_rsrp != 0 FORMAT JSON"
                )
                count_result = self._ch_query(
                    host, port, database, user, password, count_sql,
                    params={'cutoff': cutoff_str, 'ecgis': ecgi_array_literal}
                )
                rows = count_result.get('data', [])
                pre_count = int(rows[0].get('n', 0)) if rows else 0
                if pre_count >= 20000:
                    chosen_res = 11
                elif pre_count >= 1000:
                    chosen_res = 10
                else:
                    chosen_res = 9
            chosen_res = max(8, min(12, int(chosen_res)))

            # ─── Main aggregation query ───
            main_sql = (
                "SELECT "
                "  toString(geoToH3(location_geo_coordinates.1, location_geo_coordinates.2, {h3_res:UInt8})) AS h3, "
                "  count() AS samples, "
                "  quantileExact(0.5)(signal_rsrp) AS p50_rsrp, "
                "  avg(signal_rsrp) AS avg_rsrp, "
                "  max(signal_rsrp) AS max_rsrp, "
                "  quantileExact(0.75)(signal_rsrp) AS p75_rsrp, "
                "  stddevPop(signal_rsrp) AS std_rsrp, "
                "  anyHeavy(tech) AS tech_dominant "
                "FROM measurements_year_geo "
                "WHERE timestamp >= {cutoff:DateTime} "
                "  AND toDate(timestamp) >= toDate({cutoff:DateTime}) "
                "  AND (cell_ecgi IN {ecgis:Array(String)} OR cell_cgi IN {ecgis:Array(String)}) "
                "  AND signal_rsrp != 0 "
                "  AND location_geo_coordinates.1 != 0 "
                "  AND location_geo_coordinates.2 != 0 "
                "GROUP BY h3 "
                "HAVING samples >= {min_samples:UInt32} "
                "ORDER BY samples DESC "
                "LIMIT {result_limit:UInt32} "
                "FORMAT JSON"
            )
            main_result = self._ch_query(
                host, port, database, user, password, main_sql,
                params={
                    'h3_res': str(chosen_res),
                    'cutoff': cutoff_str,
                    'ecgis': ecgi_array_literal,
                    'min_samples': str(min_samples),
                    'result_limit': str(result_limit),
                }
            )

            hexes = []
            for r in main_result.get('data', []):
                try:
                    hexes.append({
                        'h3': r.get('h3'),
                        'samples': int(r.get('samples') or 0),
                        'p50_rsrp': float(r.get('p50_rsrp') or 0),
                        'avg_rsrp': float(r.get('avg_rsrp') or 0),
                        'max_rsrp': float(r.get('max_rsrp') or 0),
                        'p75_rsrp': float(r.get('p75_rsrp') or 0),
                        'std_rsrp': float(r.get('std_rsrp') or 0),
                        'tech_dominant': r.get('tech_dominant') or '',
                    })
                except (TypeError, ValueError):
                    continue

            total_samples = sum(h['samples'] for h in hexes)

            response = {
                'ok': True,
                'ecgi_resolved': ecgis,
                'h3_resolution': chosen_res,
                'total_samples': total_samples,
                'total_hexes': len(hexes),
                'time_window_hours': hours,
                'metric': metric,
                'hexes': hexes,
                'ambiguous_inputs': ambiguous,
                'pre_count': pre_count,
            }

            _FOOTPRINT_CACHE[cache_key] = {'ts': now_ts, 'data': response}
            if len(_FOOTPRINT_CACHE) > 256:
                cutoff = now_ts - _FOOTPRINT_TTL_SECONDS
                for k in [k for k, v in _FOOTPRINT_CACHE.items() if v['ts'] < cutoff]:
                    _FOOTPRINT_CACHE.pop(k, None)

            self._json_response(response)

        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8') if e.fp else str(e)
            self.send_json_error(f'ClickHouse error: {err_body}', 500)
        except urllib.error.URLError as e:
            self.send_json_error(f'Connection error: {str(e.reason)}', 500)
        except json.JSONDecodeError as e:
            self.send_json_error(f'Invalid JSON: {str(e)}', 400)
        except Exception as e:
            self.send_json_error(f'Server error: {str(e)}', 500)

    def _ch_query(self, host, port, database, user, password, sql, params=None, settings=None):
        qs_parts = [f'database={urllib.parse.quote(database)}', 'default_format=JSON']
        # Most read-only ClickHouse Cloud profiles forbid per-query setting
        # overrides (Code 452). Default to sending none; the caller can pass
        # explicit settings if it knows the account permits them.
        for k, v in (settings or {}).items():
            qs_parts.append(f'{k}=' + urllib.parse.quote(str(v), safe=''))
        if params:
            for k, v in params.items():
                qs_parts.append(f'param_{k}=' + urllib.parse.quote(str(v), safe=''))
        port_seg = f':{port}' if port and port not in ('443', '') else ''
        url = f'https://{host}{port_seg}/?' + '&'.join(qs_parts)
        req = urllib.request.Request(url, data=sql.encode('utf-8'), method='POST')
        auth_string = base64.b64encode(f'{user}:{password}'.encode()).decode()
        req.add_header('Authorization', f'Basic {auth_string}')
        req.add_header('Content-Type', 'text/plain')
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))

    def _json_response(self, payload, status=200):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_json_error(self, message, status=400):
        """Send JSON error response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))

    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[Proxy] {args[0]}")


def run_server(port=8000):
    """Start the proxy server"""
    server = HTTPServer(('', port), ProxyHandler)
    ml_status = "✓ Enabled" if ML_AVAILABLE else "✗ Disabled (pip install scikit-learn numpy)"
    print(f"""
╔════════════════════════════════════════════════════════════╗
║     ClickHouse Proxy Server with ML Coverage Analysis      ║
╠════════════════════════════════════════════════════════════╣
║  Local:       http://localhost:{port}                        ║
║  ClickHouse:  {CH_HOST}         ║
║  ML Features: {ml_status}
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    POST /query                - Execute ClickHouse query    ║
║    POST /ml/coverage          - Cell coverage (RF / Iso)    ║
║    POST /query/cell-footprint - RSRP H3 footprint per cell  ║
║    GET  /*                    - Serve static files          ║
╚════════════════════════════════════════════════════════════╝
    """)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
