export default ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const extra = { ...(config.extra || {}) };
  if (projectId) extra.eas = { ...(extra.eas || {}), projectId };
  else if (extra.eas) delete extra.eas.projectId;
  return { ...config, extra };
};
