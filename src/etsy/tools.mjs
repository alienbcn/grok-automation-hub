import {
  getMe,
  getShop,
  getListings,
  getReceipts,
  createDraftListing,
  updateListing,
  updateInventory,
  uploadListingImage,
  uploadListingFile,
  publishAllowed,
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

const DIGITAL_DEFAULTS = {
  who_made: "i_did",
  when_made: "2020_2024",
  quantity: 999,
  type: "download",
  should_auto_renew: false,
};

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
      publishOk: publishAllowed(),
      digitalTools: ["etsy_create_digital_draft", "etsy_upload_listing_image", "etsy_upload_listing_file"],
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
    handler: async ({ state }) => getListings(await shopId(), state || "draft"),
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
    description: "Create a physical DRAFT listing. Never publishes. Prefer etsy_create_digital_draft for PDFs.",
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
        tags: { type: "array", items: { type: "string" } },
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
    name: "etsy_create_digital_draft",
    description: "Create a DIGITAL download DRAFT (type=download). Never publishes. Tags max 13. Then upload image + file.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        taxonomy_id: { type: "integer" },
        tags: { type: "array", items: { type: "string" } },
        quantity: { type: "integer" },
        who_made: { type: "string" },
        when_made: { type: "string" },
      },
      required: ["title", "description", "price", "taxonomy_id"],
    },
    handler: async (args) => {
      const tags = Array.isArray(args.tags) ? args.tags.slice(0, 13) : undefined;
      return createDraftListing(await shopId(), {
        ...DIGITAL_DEFAULTS,
        title: args.title,
        description: args.description,
        price: args.price,
        taxonomy_id: args.taxonomy_id,
        quantity: args.quantity || DIGITAL_DEFAULTS.quantity,
        who_made: args.who_made || DIGITAL_DEFAULTS.who_made,
        when_made: args.when_made || DIGITAL_DEFAULTS.when_made,
        tags,
        type: "download",
        should_auto_renew: false,
      });
    },
  },
  {
    name: "etsy_upload_listing_image",
    description: "Upload one listing image via multipart. Pass file_url (preferred) or file_base64. One image per call, max 20 per listing.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: { type: "integer" },
        file_url: { type: "string" },
        file_base64: { type: "string" },
        filename: { type: "string" },
        rank: { type: "integer" },
        alt_text: { type: "string" },
      },
      required: ["listing_id"],
    },
    handler: async (args) => uploadListingImage(await shopId(), args.listing_id, args),
  },
  {
    name: "etsy_upload_listing_file",
    description: "Upload the digital product file (PDF/ZIP) via multipart. Max 20MB and 5 files. Name is what the buyer sees.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: { type: "integer" },
        file_url: { type: "string" },
        file_base64: { type: "string" },
        filename: { type: "string" },
        rank: { type: "integer" },
      },
      required: ["listing_id"],
    },
    handler: async (args) => uploadListingFile(await shopId(), args.listing_id, args),
  },
  {
    name: "etsy_update_listing",
    description: "Update title, description, price, tags. state=active is blocked unless ETSY_PUBLISH_OK=true.",
    inputSchema: {
      type: "object",
      properties: {
        listing_id: { type: "integer" },
        title: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        state: { type: "string" },
      },
      required: ["listing_id"],
    },
    handler: async ({ listing_id, ...rest }) => {
      try {
        return await updateListing(await shopId(), listing_id, rest);
      } catch (e) {
        if (e?.code === "PUBLISH_BLOCKED") {
          return { ok: false, status: 403, error: { message: e.message, publishOk: false } };
        }
        throw e;
      }
    },
  },
  {
    name: "etsy_update_inventory",
    description: "Replace listing inventory products/offerings. Not used for simple digital PDFs.",
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
