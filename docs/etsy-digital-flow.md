# Digital listing flow (draft only)

1. etsy_create_digital_draft — type=download, no state=active.
2. etsy_upload_listing_image — file_url or file_base64, one photo per call.
3. etsy_upload_listing_file — PDF/ZIP ≤20MB, filename is buyer-visible.
4. Stay in draft. Publish requires ETSY_PUBLISH_OK=true AND an explicit update with state=active.

Live API still needs shop open + OAuth. Code paths do not.
