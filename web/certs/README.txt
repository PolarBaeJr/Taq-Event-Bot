HTTPS certificate setup for web/server.js

Your server needs TWO files:
1) A certificate file
2) A private key file

The templates in this folder are:
- certificate-template.txt
- private-key-template.txt

How to use:
1) Copy your real certificate PEM into a file such as:
   web/certs/server-cert.pem
2) Copy your real private key PEM into a file such as:
   web/certs/server-key.pem
3) Start the web server with:

   PORT=443 \
   HTTPS_CERT_FILE=web/certs/server-cert.pem \
   HTTPS_KEY_FILE=web/certs/server-key.pem \
   node web/server.js

Notes:
- PEM files are plain text files.
- The repo already ignores *.pem and *.key, so those files should not be committed.
- For local testing, a self-signed certificate is fine.
- For production, use Let's Encrypt or Cloudflare Origin certificates.
