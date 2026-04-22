// RAG document registry — loaded at first launch for embedding indexing

import nhmGuidelines from './nhm-asha-guidelines.txt';
import whoGuidelines from './who-skin-guidelines.txt';

export const RAG_DOCUMENTS = [
  { name: 'NHM ASHA Guidelines',   content: nhmGuidelines },
  { name: 'WHO Skin Disease Guide', content: whoGuidelines },
];
