// Utility to safely get environment variables in browser environments
// This handles cases where process.env might be undefined (Vite) or import.meta.env might be undefined (Webpack/Next.js)

export const getEnv = (key: string): string | undefined => {
  // 1. Try Vite standard (import.meta.env)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }

  // 2. Try Node/Next.js/CRA standard (process.env)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }

  return undefined;
};

// Helper to check multiple variations of a key (e.g. VITE_API_KEY, NEXT_PUBLIC_API_KEY, API_KEY)
export const getEnvVar = (baseKey: string): string | undefined => {
  return getEnv(baseKey) || 
         getEnv(`VITE_${baseKey}`) || 
         getEnv(`NEXT_PUBLIC_${baseKey}`) || 
         getEnv(`REACT_APP_${baseKey}`);
};