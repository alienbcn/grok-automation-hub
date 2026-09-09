import {
  getMe,
  getShop,
  getListings,
  getReceipts,
  createDraftListing,
  updateListing,
  updateInventory,
} from "./client.mjs";
import { getTokens } from "../store/tokens.mjs";

async function shopId() {
  if (process.env.ETSY_SHOP_ID) return process.env.ETSY_SHOP_ID;
  const tokens = await getTokens();
  if (tokens?.shopId) return tokens.shopId;
  const me = await getMe();
  const id = me?.data?.shop_id;
  if (!id) throw new Error("ETSY_SHOP_ID missing");
  return String(id);
}

export const ETSY_TOOLS = [
  {
    name: "etsy_status",
    description: "Check Etsy integration gate, env readiness and connection (no secrets).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => ({
      app: "grok-automations",
      live: process.env.ETSY_ALLOW_LIVE === "true",
      keyConfigured: Boolean(process.env.ETSY_API_KEY),
      secretConfigured: Boolean(process.env.ETSY_SHARED_SECRET),
      shopIdConfigured: Boolean(process.env.ETSY_SHOP_ID),
      supabase: Boolean(process.env.SUPABASE_URL),
      connected: Boolean((await getTokens())?.accessToken),
    }),
  },
  {
    name: "etsy_get_shop",
    description: "Get the connected Etsy shop profile.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => getShop(await shopId()),
  },
  {
    name: "etsy_get_listings",
    description: "List shop listings. state: active|draft|inactive|expired|sold_out",
    inputSchema: {
      type: "object",
      properties: { state: { type: "string" } },
    },
    handler: async ({ state }) => getListings(await shopId(), state || "active"),
  },
  {
    name: "etsy_get_orders",
    description: "Get recent shop receipts/orders.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => getReceipts(await shopId()),
  },
  {
    name: "etsy_get_sales",
    description: "Get recent paid receipts as a simple sales view.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => getReceipts(await shopId()),
  },
  {
    name: "etsy_create_listing",
    description: "Create a physical DRAFT listing. Does not publish. Requires listings_w after approval.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        quantity: { type: "integer" },
        who_made: { type: "string" },
        when_made: { type: "string" },
        taxonomy_id: { type: "integer" },
        shipping_profile_id: { type: "integer" },
        readiness_state_id: { type: "integer" },
      },
      required: ["title", "description", "price", "quantity", "who_made", "when_made", "taxonomy_id"],
    },
    handler: async (args) =>
      createDraftListing(await shopId(), {
        ...args,
        type: "physical",
        should_auto_renew: false,
      }),
  },
  {
    name: "etsy_update_listing",
    description: "Update an existing listing (title, description, price, state). No delete.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: { type: "integer" },
        title: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        state: { type: "string" },
      },
      required: ["listing_id"],
    },
    handler: async ({ listing_id, ...rest }) => updateListing(await shopId(), listing_id, rest),
  },
  {
    name: "etsy_update_inventory",
    description: "Replace listing inventory products/offerings.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: { type: "integer" },
        products: { type: "array" },
      },
      required: ["listing_id", "products"],
    },
    handler: async ({ listing_id, products }) => updateInventory(listing_id, { products }),
  },
];
