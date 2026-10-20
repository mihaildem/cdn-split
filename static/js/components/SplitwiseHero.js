/**
 * SplitwiseHero Component - Switches between V1 Bento and V2 Precision Ledger
 */

import { SplitwiseHeroV1 } from "./SplitwiseHeroV1.js";
import { SplitwiseHeroV2 } from "./SplitwiseHeroV2.js";

export const SplitwiseHero = {
  name: "SplitwiseHero",
  components: { SplitwiseHeroV1, SplitwiseHeroV2 },
  props: {
    store: { type: Object, required: true }
  },
  template: `
    <SplitwiseHeroV2 v-if="store.uiVersion !== 'v1'" :store="store" />
    <SplitwiseHeroV1 v-else :store="store" />
  `
};
