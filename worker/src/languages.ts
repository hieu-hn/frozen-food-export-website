// worker/src/languages.ts
import { jsonResponse, errorResponse, type LanguageData } from './utils';
import { queryD1 } from './db';

interface Env {
    DB: D1Database;
}

// Lấy tất cả ngôn ngữ
export async function getLanguages(_request: Request, env: Env): Promise<Response> {
    try {
        const result = await queryD1(env, 'SELECT id, code, name, is_active FROM languages');
        return jsonResponse(result.results);
    } catch (error: any) {
        return errorResponse(`Không thể lấy ngôn ngữ: ${error.message}`, 500);
    }
}

// Thêm ngôn ngữ mới
export async function createLanguage(request: Request, env: Env): Promise<Response> {
    try {
        const { code, name, is_active } = await (request.json() as Promise<LanguageData>); // Type assertion
        if (!code || !name) {
            return errorResponse('Mã ngôn ngữ và tên là bắt buộc', 400);
        }

        await queryD1(env, 'INSERT INTO languages (code, name, is_active) VALUES (?, ?, ?)', [code, name, is_active ? 1 : 0]);
        return jsonResponse({ message: 'Ngôn ngữ đã được tạo thành công' }, 201);
    } catch (error: any) {
        if (error.message.includes('UNIQUE constraint failed: languages.code')) {
            return errorResponse('Mã ngôn ngữ đã tồn tại', 409);
        }
        return errorResponse(`Không thể tạo ngôn ngữ: ${error.message}`, 500);
    }
}

// Cập nhật ngôn ngữ
export async function updateLanguage(request: Request, env: Env, languageId: string): Promise<Response> {
    try {
        const { name, is_active } = await (request.json() as Promise<Partial<LanguageData>>); // Type assertion for partial update
        if (!name && is_active === undefined) {
            return errorResponse('Không có dữ liệu cập nhật được cung cấp', 400);
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (name !== undefined) { updates.push('name = ?'); params.push(name); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

        if (updates.length === 0) {
            return errorResponse('Không có trường hợp lệ để cập nhật', 400);
        }

        params.push(languageId);
        await queryD1(env, `UPDATE languages SET ${updates.join(', ')} WHERE id = ?`, params);
        return jsonResponse({ message: 'Ngôn ngữ đã được cập nhật thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể cập nhật ngôn ngữ: ${error.message}`, 500);
    }
}

// Xóa ngôn ngữ
export async function deleteLanguage(_request: Request, env: Env, languageId: string): Promise<Response> {
    try {
        // D1 sẽ tự động xóa các bản dịch liên quan nhờ ON DELETE CASCADE
        await queryD1(env, 'DELETE FROM languages WHERE id = ?', [languageId]);
        return jsonResponse({ message: 'Ngôn ngữ đã được xóa thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể xóa ngôn ngữ: ${error.message}`, 500);
    }
}
