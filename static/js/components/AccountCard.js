/**
 * AccountCard Component - Switches between V1 and V2 Precision Account Card
 */

import { AccountCardV1 } from "./AccountCardV1.js";
import { AccountCardV2 } from "./AccountCardV2.js";

export const AccountCard = {
  name: "AccountCard",
  components: { AccountCardV1, AccountCardV2 },
  props: {
    account: { type: Object, required: true },
    store: { type: Object, required: true }
  },
  template: `
    <AccountCardV2 v-if="store.uiVersion !== 'v1'" :account="account" :store="store" />
    <AccountCardV1 v-else :account="account" :store="store" />
  `
};
