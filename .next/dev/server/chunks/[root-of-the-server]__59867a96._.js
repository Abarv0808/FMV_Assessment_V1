module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/app/api/bm/store/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.0.10_@opentelemetry+api@1.9.0_react-dom@19.2.0_react@19.2.0__react@19.2.0/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$99$2e$2$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@supabase+supabase-js@2.99.2/node_modules/@supabase/supabase-js/dist/index.mjs [app-route] (ecmascript) <locals>");
;
;
function createDb() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$supabase$2b$supabase$2d$js$40$2$2e$99$2e$2$2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(("TURBOPACK compile-time value", "https://tzhqhstbtebyiccztpsk.supabase.co"), process.env.SUPABASE_SERVICE_ROLE_KEY || ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aHFoc3RidGVieWljY3p0cHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDEyOTUsImV4cCI6MjA4ODExNzI5NX0.elZXx0TlktY__46yCd0CgNvBNa3opygCqTXjbCarf6k"));
}
async function POST(request) {
    try {
        const body = await request.json();
        const { indication, dataSource, trialPhase, uploadMode, countries } = body;
        if (!indication || !countries || !Array.isArray(countries)) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                success: false,
                error: "Missing required fields"
            }, {
                status: 400
            });
        }
        const db = createDb();
        const source = dataSource === "IQVIA GrantPlan" ? "IQVIA_GRANTPLAN" : "IQVIA_GPI_GRANTSMANAGER";
        // Map trial phase to valid enum
        const phaseMap = {
            "All Phases": "Phase I",
            "Phase 1": "Phase I",
            "Phase 4": "Phase IV",
            "Phase I": "Phase I",
            "Phase II": "Phase II",
            "Phase III": "Phase III",
            "Phase IV": "Phase IV"
        };
        const phase = phaseMap[trialPhase] || "Phase I";
        // Get currency mapping from database
        const { data: currencyData } = await db.from("country_currencies").select("country, currency_code");
        const currencyMap = {};
        if (currencyData) {
            for (const row of currencyData){
                currencyMap[row.country] = row.currency_code;
            }
        }
        // Delete existing if replace mode - only same indication + source + phase
        // IMPORTANT: We now use "append" by default to prevent accidental data loss
        // Only use replace if explicitly set AND indication matches exactly
        if (uploadMode === "replace" && indication && indication.trim().length > 0) {
            console.log("[v0] Replace mode - deleting files for:", {
                indication,
                source,
                phase
            });
            const { data: existing } = await db.from("benchmark_files").select("id, indication, trial_phase, source").eq("indication", indication.trim()).eq("source", source).eq("trial_phase", phase);
            if (existing?.length) {
                console.log("[v0] Found files to replace:", existing.map((f)=>`${f.indication} - ${f.trial_phase}`));
                const ids = existing.map((f)=>f.id);
                await db.from("benchmark_procedures").delete().in("benchmark_file_id", ids);
                await db.from("benchmark_files").delete().in("id", ids);
                console.log("[v0] Deleted", ids.length, "files for indication:", indication);
            } else {
                console.log("[v0] No existing files found to replace for:", indication);
            }
        } else {
            console.log("[v0] Append mode - not deleting any existing files");
        }
        let filesCreated = 0;
        let proceduresCreated = 0;
        for (const country of countries){
            const currency = currencyMap[country.country] || country.currency || "USD";
            // Generate a proper file_name - THIS IS THE KEY FIX
            const fileName = `${indication.replace(/\s+/g, "_")}_${country.country.replace(/\s+/g, "_")}_${phase.replace(/\s+/g, "_")}`;
            const { data: fileData, error: fileError } = await db.from("benchmark_files").insert({
                file_name: fileName,
                indication,
                country: country.country,
                currency,
                trial_phase: phase,
                source,
                procedure_count: country.procedures?.length || 0
            }).select("id").single();
            if (fileError) {
                console.error("Error creating benchmark file:", fileError);
                continue;
            }
            filesCreated++;
            // Insert procedures with correct column names for benchmark_procedures table
            // The excel-parser returns: code, name, category, p25, p50, p75, p90, p100, sourceRef
            if (country.procedures?.length && fileData?.id) {
                // Debug: log first 3 raw procedures to see what's being passed
                console.log("[v0] Sample raw procedures from parser (first 3):");
                country.procedures.slice(0, 3).forEach((p, i)=>{
                    console.log(`[v0]   ${i + 1}. name="${p.name}" code="${p.code}" p25=${p.p25} p50=${p.p50} p75=${p.p75} p90=${p.p90}`);
                });
                const procedures = country.procedures.map((proc)=>{
                    // Handle both number and string values for percentiles
                    const parseValue = (val)=>{
                        if (val === null || val === undefined || val === "") return null;
                        const num = typeof val === "number" ? val : parseFloat(val);
                        return isNaN(num) ? null : num;
                    };
                    return {
                        benchmark_file_id: fileData.id,
                        procedure_code: proc.code || proc.procedure_code || proc.procedureCode || "",
                        procedure_name: proc.name || proc.procedure_name || proc.procedureName || proc.procedure || "Unknown",
                        category: proc.category || "Procedures",
                        p25: parseValue(proc.p25),
                        p50: parseValue(proc.p50),
                        p75: parseValue(proc.p75),
                        p90: parseValue(proc.p90),
                        p100: parseValue(proc.p100),
                        mean: parseValue(proc.mean),
                        sample_size: proc.sample_size ? parseInt(proc.sample_size) : null,
                        source_ref: proc.sourceRef || proc.source_ref || null
                    };
                });
                const { error: procError } = await db.from("benchmark_procedures").insert(procedures);
                if (procError) {
                    console.error("[v0] Error inserting procedures:", procError);
                } else {
                    proceduresCreated += procedures.length;
                }
            }
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            message: `Created ${filesCreated} files with ${proceduresCreated} procedures`,
            stats: {
                countriesProcessed: countries.length,
                benchmarkFilesCreated: filesCreated,
                proceduresInserted: proceduresCreated,
                errors: []
            }
        });
    } catch (error) {
        console.error("Upload error:", error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$0$2e$10_$40$opentelemetry$2b$api$40$1$2e$9$2e$0_react$2d$dom$40$19$2e$2$2e$0_react$40$19$2e$2$2e$0_$5f$react$40$19$2e$2$2e$0$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: false,
            error: String(error)
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__59867a96._.js.map