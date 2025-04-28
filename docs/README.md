# Link Preview Image Extraction

This guide explains how to extract link preview image URLs from messages in whatsapp-web.js.

## Getting Link Preview Data

When a message is received that contains a link, WhatsApp generates a link preview with metadata such as title, description, and often a thumbnail image. The library now provides a simple way to extract this information.

### Using the `getLinkPreview()` Method

The `Message` class now includes a `getLinkPreview()` method that returns link preview data if available:

```javascript
// Handle incoming messages
client.on("message", async (msg) => {
    const linkPreview = msg.getLinkPreview();

    if (linkPreview) {
        console.log("Link preview found:");
        console.log(`Title: ${linkPreview.title}`);
        console.log(`Description: ${linkPreview.description}`);

        // Most importantly, the thumbnail URL:
        if (linkPreview.thumbnailUrl) {
            console.log(`Thumbnail URL: ${linkPreview.thumbnailUrl}`);
            // You can now use this URL to download or display the image
        }
    }
});
```

### Message Creation Events

The same method works for message creation events (messages sent by yourself):

```javascript
client.on("message_create", async (msg) => {
    const linkPreview = msg.getLinkPreview();

    if (linkPreview) {
        // Process the link preview data
        console.log(`Preview thumbnail: ${linkPreview.thumbnailUrl}`);
    }
});
```

## Link Preview Properties

The `getLinkPreview()` method returns an object with the following properties:

| Property       | Type   | Description                                       |
| -------------- | ------ | ------------------------------------------------- |
| `type`         | String | Type of the preview                               |
| `source`       | String | Source URL of the link                            |
| `thumbnailUrl` | String | URL of the preview thumbnail image (if available) |
| `title`        | String | Title of the linked content (if available)        |
| `description`  | String | Description of the linked content (if available)  |
| `canonicalUrl` | String | Canonical URL of the link (if available)          |
| `matchedText`  | String | The text that was matched as a URL (if available) |

## Downloading Link Preview Thumbnails

### Using `downloadLinkPreviewThumbnail()` Method

The `Message` class now includes a `downloadLinkPreviewThumbnail()` method that downloads the link preview thumbnail and returns it as a `MessageMedia` object:

```javascript
client.on("message", async (msg) => {
    // Download the thumbnail if available
    const thumbnail = await msg.downloadLinkPreviewThumbnail();

    if (thumbnail) {
        console.log("Thumbnail downloaded:");
        console.log(`MIME type: ${thumbnail.mimetype}`);
        console.log(`Filename: ${thumbnail.filename}`);

        // You can use this MessageMedia object to send the image
        const chat = await msg.getChat();
        chat.sendMessage(thumbnail, { caption: "Link preview thumbnail" });

        // Or you can save it to a file
        thumbnail.toFilePath("./thumbnail.jpg");
    }
});
```

This method is especially useful for reliably capturing thumbnails from message_create events:

```javascript
client.on("message_create", async (msg) => {
    // When you or another device sends a link
    const thumbnail = await msg.downloadLinkPreviewThumbnail();
    if (thumbnail) {
        // Now you have the thumbnail available as a MessageMedia object
        // You can forward it, save it, or process it
    }
});
```

## Manual Thumbnail Processing

If you prefer to handle the HTTP requests yourself, you can still use the URL from `getLinkPreview()`:

```javascript
// Save link preview thumbnails to disk
const fs = require("fs");
const https = require("https");
const path = require("path");

client.on("message", async (msg) => {
    const linkPreview = msg.getLinkPreview();

    if (linkPreview && linkPreview.thumbnailUrl) {
        const fileName = `thumbnail_${Date.now()}.jpg`;
        const filePath = path.join(__dirname, "thumbnails", fileName);

        // Download the image
        https.get(linkPreview.thumbnailUrl, (response) => {
            const writeStream = fs.createWriteStream(filePath);
            response.pipe(writeStream);

            writeStream.on("finish", () => {
                console.log(`Saved thumbnail to ${filePath}`);
            });
        });
    }
});
```

## Notes

-   Link preview generation is automatic in WhatsApp and depends on the linked content
-   Some links may not generate previews or thumbnails
-   The availability of preview data depends on the type of link and how WhatsApp processes it
