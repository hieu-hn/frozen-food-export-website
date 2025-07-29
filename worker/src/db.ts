// worker/src/db.ts

interface Env {
    DB: D1Database;
}

// Hàm trợ giúp để thực hiện truy vấn D1
export async function queryD1(env: Env, sql: string, params: any[] = []): Promise<D1Result> {
    try {
        const result = await env.DB.prepare(sql).bind(...params).all();
        return result;
    } catch (error: any) {
        console.error("D1 Query Error:", error);
        throw new Error(`Database error: ${error.message}`);
    }
}
