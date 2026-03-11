// ─── Flycomm Visualization Data Generators ───
// These generate simulated RF/signal/network data for visualization components only.
// All RSU, Cluster, Alert, and Organization data comes from the database.

function generateSpectrumData(band = "cellular", hasAnomaly = false) {
  const data = [];
  let freqStart, freqEnd, step;

  if (band === "cellular") { freqStart = 700; freqEnd = 2700; step = 5; }
  else if (band === "wifi") { freqStart = 2400; freqEnd = 2500; step = 1; }
  else if (band === "gnss") { freqStart = 1550; freqEnd = 1600; step = 0.5; }
  else { freqStart = 400; freqEnd = 3000; step = 10; }

  for (let freq = freqStart; freq <= freqEnd; freq += step) {
    const noise = -110 + (Math.random() - 0.5) * 6;
    let baseline = noise;
    let realtime = noise;

    if (band === "cellular" || band === "full") {
      [700, 850, 1800, 2100, 2600].forEach(peak => {
        const dist = Math.abs(freq - peak);
        if (dist < 30) {
          const gain = 50 * Math.exp(-(dist * dist) / (2 * 10 * 10));
          baseline += gain;
          realtime += gain + (Math.random() - 0.5) * 3;
        }
      });
    }
    if ((band === "wifi" || band === "full") && Math.abs(freq - 2437) < 15) {
      const dist = Math.abs(freq - 2437);
      const gain = 55 * Math.exp(-(dist * dist) / (2 * 5 * 5));
      baseline += gain;
      realtime += gain + (Math.random() - 0.5) * 2;
    }
    if ((band === "gnss" || band === "full") && Math.abs(freq - 1575.42) < 5) {
      const dist = Math.abs(freq - 1575.42);
      const gain = 30 * Math.exp(-(dist * dist) / (2 * 1.5 * 1.5));
      baseline += gain;
      realtime += gain + (Math.random() - 0.5) * 2;
    }

    if (hasAnomaly) {
      const anomalyFreq = band === "gnss" ? 1575.42 : band === "wifi" ? 2437 : 1800;
      if (Math.abs(freq - anomalyFreq) < 15) {
        realtime += 15 + Math.random() * 5;
      }
    }

    data.push({
      frequency: freq,
      baseline: parseFloat(Math.max(baseline, -115).toFixed(1)),
      realtime: parseFloat(Math.max(realtime, -115).toFixed(1)),
    });
  }
  return data;
}

function generateSignalMetrics() {
  return {
    rsrp: parseFloat((-85 + (Math.random() - 0.5) * 4).toFixed(1)),
    rsrq: parseFloat((-9.5 + (Math.random() - 0.5) * 1).toFixed(1)),
    sinr: parseFloat((12 + (Math.random() - 0.5) * 2).toFixed(1)),
    wifi_rssi: parseFloat((-62 + (Math.random() - 0.5) * 4).toFixed(1)),
    gnss_fix: "3D",
    gnss_satellites_visible: Math.floor(12 + Math.random() * 5),
    gnss_satellites_total: 16,
    hdop: parseFloat((1.2 + (Math.random() - 0.5) * 0.4).toFixed(1)),
    pdop: parseFloat((1.8 + (Math.random() - 0.5) * 0.6).toFixed(1)),
    latency: parseFloat((23 + (Math.random() - 0.5) * 10).toFixed(0)),
    jitter: parseFloat((4 + (Math.random() - 0.5) * 3).toFixed(1)),
    packet_loss: parseFloat((0.02 + Math.random() * 0.05).toFixed(2)),
    throughput_down: parseFloat((45 + (Math.random() - 0.5) * 10).toFixed(1)),
    throughput_up: parseFloat((12.8 + (Math.random() - 0.5) * 5).toFixed(1)),
  };
}

export {
  generateSpectrumData,
  generateSignalMetrics,
};