import { AbsoluteFill } from "remotion";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { getConfigSignature } from "../../../shared/config-utils";
import { TimelineRenderer } from "../../../shared/compositions/TimelineRenderer";
import type { ResolvedTimelineConfig, TimelineCompositionProps } from "../../../shared/types";
import { loadTimelineConfig } from "../load-config";

export const Timeline: FC<TimelineCompositionProps> = ({ config: initialConfig }) => {
  if (!initialConfig) {
    throw new Error("Timeline composition did not receive config metadata.");
  }

  const [config, setConfig] = useState<ResolvedTimelineConfig>(initialConfig);
  const configRef = useRef(initialConfig);
  const signatureRef = useRef(getConfigSignature(initialConfig));

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const nextConfig = await loadTimelineConfig();
      const nextSignature = getConfigSignature(nextConfig);
      if (cancelled || nextSignature === signatureRef.current) {
        return;
      }

      signatureRef.current = nextSignature;
      configRef.current = nextConfig;
      setConfig(nextConfig);
    };

    const interval = window.setInterval(() => {
      void reload();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <TimelineRenderer config={config} />
    </AbsoluteFill>
  );
};
