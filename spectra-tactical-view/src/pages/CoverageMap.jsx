import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AnimatePresence } from "framer-motion";
import TacticalMap from "../components/dashboard/TacticalMap";
import RSUDetailPanel from "../components/dashboard/RSUDetailPanel";

export default function CoverageMap() {
  const [selectedRsu, setSelectedRsu] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const handleRsuClick = useCallback((rsu) => {
    setSelectedRsu(rsu);
    setFlyTarget({ latitude: rsu.latitude, longitude: rsu.longitude, id: Date.now() });
  }, []);

  const isAdmin = currentUser?.custom_role === 'admin' || currentUser?.is_super_admin || currentUser?.role === 'admin';

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 h-full relative">
        <TacticalMap
          flyTarget={flyTarget}
          onRsuClick={handleRsuClick}
          selectedRsuId={selectedRsu?.id}
          organizationId={currentUser?.organization_id}
          isAdmin={isAdmin}
        />
      </div>
      <AnimatePresence>
        {selectedRsu && (
          <RSUDetailPanel
            key={selectedRsu.id}
            rsu={selectedRsu}
            onClose={() => setSelectedRsu(null)}
            organizationId={currentUser?.organization_id}
            isAdmin={isAdmin}
          />
        )}
      </AnimatePresence>
    </div>
  );
}