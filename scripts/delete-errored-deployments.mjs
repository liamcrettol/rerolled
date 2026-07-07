// Usage: node scripts/delete-errored-deployments.mjs <VERCEL_TOKEN>
// Get your token at: Vercel Dashboard → Settings → Tokens

const token = process.argv[2];
const projectName = "rerolled";

if (!token) {
  console.error("Usage: node scripts/delete-errored-deployments.mjs <VERCEL_TOKEN>");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function fetchAll() {
  const deployments = [];
  let next = null;
  do {
    const url = `https://api.vercel.com/v6/deployments?app=${projectName}&limit=100${next ? `&until=${next}` : ""}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list deployments: ${res.status} ${text}`);
    }
    const data = await res.json();
    deployments.push(...data.deployments);
    next = data.pagination?.next ?? null;
  } while (next);
  return deployments;
}

const all = await fetchAll();
const errored = all.filter((d) => d.state === "ERROR");

console.log(`Found ${all.length} total deployments, ${errored.length} errored.`);

if (errored.length === 0) {
  console.log("Nothing to delete.");
  process.exit(0);
}

for (const d of errored) {
  const res = await fetch(`https://api.vercel.com/v13/deployments/${d.uid}`, {
    method: "DELETE",
    headers,
  });
  if (res.ok || res.status === 204) {
    console.log(`✓ Deleted ${d.uid} (${d.url})`);
  } else {
    const text = await res.text();
    console.error(`✗ Failed to delete ${d.uid}: ${res.status} ${text}`);
  }
}

console.log("Done.");
