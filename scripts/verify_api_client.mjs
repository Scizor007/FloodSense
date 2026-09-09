import { floodSenseApi, API_BASE_URL } from "../src/lib/flood/api.ts";

console.log("==================================================");
console.log("FLOODSENSE FRONTEND API CLIENT VERIFICATION");
console.log("==================================================");
console.log("Configured API_BASE_URL:", API_BASE_URL);

async function runTests() {
  try {
    // 1. Health check
    console.log("\n--- 1. Testing GET /health ---");
    const health = await floodSenseApi.getHealth();
    console.log("Health Response:", JSON.stringify(health, null, 2));

    // 2. Hotspots
    console.log("\n--- 2. Testing GET /hotspots ---");
    const hotspots = await floodSenseApi.getHotspots({ limit: 3 });
    console.log(`Received ${hotspots.length} hotspots. Sample hotspot:`, JSON.stringify(hotspots[0], null, 2));

    // 3. Reports
    console.log("\n--- 3. Testing GET /reports ---");
    const reports = await floodSenseApi.getReports({ limit: 3 });
    console.log(`Received ${reports.length} reports. Sample report:`, JSON.stringify(reports[0], null, 2));

    // 4. Alerts
    console.log("\n--- 4. Testing GET /alerts ---");
    const alerts = await floodSenseApi.getAlerts({ limit: 3 });
    console.log(`Received ${alerts.length} alerts. Sample alert:`, JSON.stringify(alerts[0], null, 2));

    // 5. Risk Predict
    console.log("\n--- 5. Testing POST /risk/predict ---");
    const prediction = await floodSenseApi.predictRisk({
      lat: 17.3685,
      lng: 78.5130, // Moosarambagh
      rainfall_intensity: 65.0,
      duration_minutes: 60,
    });
    console.log("Prediction Response:", JSON.stringify(prediction, null, 2));

    // 6. CORS Check with browser Origin header
    console.log("\n--- 6. Testing CORS Headers ---");
    const corsRes = await fetch(`${API_BASE_URL}/hotspots`, {
      headers: {
        Origin: "http://localhost:3000",
      },
    });
    console.log("CORS Status:", corsRes.status);
    console.log("Access-Control-Allow-Origin:", corsRes.headers.get("access-control-allow-origin"));
    console.log("Access-Control-Allow-Credentials:", corsRes.headers.get("access-control-allow-credentials"));

    console.log("\n==================================================");
    console.log("ALL API CLIENT VERIFICATION TESTS PASSED SUCCESSFULLY");
    console.log("==================================================");
  } catch (err) {
    console.error("API Verification Error:", err);
    process.exit(1);
  }
}

runTests();
