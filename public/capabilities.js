(function (root) {
  const capabilityLabels = {
    "model:chat": "模型 API",
    "coze:invoke": "Coze 工作流",
  };

  function availableCapabilities(config) {
    const available = new Set();
    const hasModel =
      Array.isArray(config?.providers) &&
      config.providers.some((provider) => Boolean(provider.enabled && provider.configured));
    const coze = config?.integrations?.coze;
    if (hasModel) available.add("model:chat");
    if (coze?.enabled && coze?.configured) available.add("coze:invoke");
    return available;
  }

  function missingCapabilities(requiredCapabilities, config) {
    const available = availableCapabilities(config);
    return Array.from(new Set(Array.isArray(requiredCapabilities) ? requiredCapabilities : []))
      .filter((capability) => capabilityLabels[capability] && !available.has(capability));
  }

  function describeMissingCapabilities(capabilities) {
    return Array.from(new Set(Array.isArray(capabilities) ? capabilities : []))
      .map((capability) => capabilityLabels[capability] || capability)
      .join("、");
  }

  root.HubCapabilityGate = {
    availableCapabilities,
    missingCapabilities,
    describeMissingCapabilities,
  };
})(window);
