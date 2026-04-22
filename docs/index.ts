// Metro asset module IDs — passed to Asset.fromModule() in indexer.ts
// require() of a static asset returns a number (the Metro module ID)

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const NHM_ASHA_ASSET: number = require('./nhm-asha-guidelines.txt') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const WHO_SKIN_ASSET: number = require('./who-skin-guidelines.txt') as number;
