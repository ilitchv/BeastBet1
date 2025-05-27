// This file is intentionally left empty or can be deleted.
// By removing the default page.tsx for the root, Next.js will
// attempt to serve public/index.html if it exists when accessing '/'.

// You can optionally add a simple component that redirects or just returns null
// if you want to keep the file for some reason, but for serving public/index.html
// at the root, deleting or emptying this file is often the simplest.

export default function HomePage() {
  // console.log("Attempting to render HomePage, but public/index.html should take precedence if this file is minimal or removed.");
  return null;
}
