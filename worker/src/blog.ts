// worker/src/blog.ts
import { generateUUID, jsonResponse, errorResponse } from './utils';
import { queryD1 } from './db';

interface Env {
    DB: D1Database;
    R2_BUCKET: R2Bucket;
}

// Hàm trợ giúp để lấy ID ngôn ngữ từ code
async function getLanguageIdByCode(env: Env, code: string): Promise<number | null> {
    const langResult = await queryD1(env, 'SELECT id FROM languages WHERE code = ?', [code]);
    return langResult.results.length > 0 ? (langResult.results[0] as { id: number }).id : null;
}

// Lấy tất cả bài viết blog (có thể lọc theo ngôn ngữ)
export async function getBlogPosts(request: Request, env: Env): Promise<Response> {
    try {
        const url = new URL(request.url);
        const langCode = url.searchParams.get('lang') || 'en'; // Ngôn ngữ mặc định
        const languageId = await getLanguageIdByCode(env, langCode);

        if (!languageId) {
            return errorResponse(`Mã ngôn ngữ '${langCode}' không tìm thấy.`, 404);
        }

        const postsResult = await queryD1(
            env,
            `SELECT
                bp.id, bp.author_id, bp.main_image_url, bp.published_at, bp.is_published,
                bpt.title, bpt.content, bpt.slug,
                u.email as author_email
            FROM
                blog_posts bp
            JOIN
                blog_post_translations bpt ON bp.id = bpt.blog_post_id
            LEFT JOIN
                users u ON bp.author_id = u.id
            WHERE
                bpt.language_id = ? AND bp.is_published = 1
            ORDER BY bp.published_at DESC`,
            [languageId]
        );

        return jsonResponse(postsResult.results);
    } catch (error: any) {
        return errorResponse(`Không thể lấy bài viết blog: ${error.message}`, 500);
    }
}

// Lấy bài viết blog theo Slug (có thể lọc theo ngôn ngữ)
export async function getBlogPostBySlug(request: Request, env: Env, slug: string): Promise<Response> {
    try {
        const url = new URL(request.url);
        const langCode = url.searchParams.get('lang') || 'en';
        const languageId = await getLanguageIdByCode(env, langCode);

        if (!languageId) {
            return errorResponse(`Mã ngôn ngữ '${langCode}' không tìm thấy.`, 404);
        }

        const postResult = await queryD1(
            env,
            `SELECT
                bp.id, bp.author_id, bp.main_image_url, bp.published_at, bp.is_published,
                bpt.title, bpt.content, bpt.slug,
                u.email as author_email
            FROM
                blog_posts bp
            JOIN
                blog_post_translations bpt ON bp.id = bpt.blog_post_id
            LEFT JOIN
                users u ON bp.author_id = u.id
            WHERE
                bpt.slug = ? AND bpt.language_id = ? AND bp.is_published = 1`,
            [slug, languageId]
        );

        if (postResult.results.length === 0) {
            return errorResponse('Không tìm thấy bài viết blog', 404);
        }

        return jsonResponse(postResult.results[0]);
    } catch (error: any) {
        return errorResponse(`Không thể lấy bài viết blog: ${error.message}`, 500);
    }
}

// Thêm bài viết blog mới
export async function createBlogPost(request: Request, env: Env): Promise<Response> {
    try {
        const formData = await request.formData();
        const authorId = formData.get('author_id') as string; // Lấy từ request.user.userId trong middleware
        const isPublished = formData.get('is_published') === 'true' ? 1 : 0;
        const imageFile = formData.get('image') as File | null;

        if (!authorId) {
            return errorResponse('ID tác giả là bắt buộc', 400);
        }

        const postId = generateUUID();
        let imageUrl: string | null = null;

        if (imageFile) {
            const imageFileName = `${postId}_${imageFile.name}`;
            await env.R2_BUCKET.put(imageFileName, await imageFile.arrayBuffer());
            imageUrl = `https://${env.R2_BUCKET.name}.r2.dev/${imageFileName}`;
        }

        await queryD1(
            env,
            'INSERT INTO blog_posts (id, author_id, main_image_url, published_at, is_published) VALUES (?, ?, ?, ?, ?)',
            [postId, authorId, imageUrl, new Date().toISOString(), isPublished]
        );

        // Xử lý các bản dịch
        const languagesResult = await queryD1(env, 'SELECT id, code FROM languages WHERE is_active = 1');
        const activeLanguages = languagesResult.results as { id: number; code: string }[];

        for (const lang of activeLanguages) {
            const title = formData.get(`title_${lang.code}`) as string;
            const content = formData.get(`content_${lang.code}`) as string;
            const slug = formData.get(`slug_${lang.code}`) as string || `${title.toLowerCase().replace(/\s+/g, '-')}-${lang.code}`;

            if (title) {
                await queryD1(
                    env,
                    'INSERT INTO blog_post_translations (blog_post_id, language_id, title, content, slug) VALUES (?, ?, ?, ?, ?)',
                    [postId, lang.id, title, content, slug]
                );
            }
        }

        return jsonResponse({ message: 'Bài viết blog đã được tạo thành công', postId, imageUrl }, 201);
    } catch (error: any) {
        return errorResponse(`Không thể tạo bài viết blog: ${error.message}`, 500);
    }
}

// Cập nhật bài viết blog
export async function updateBlogPost(request: Request, env: Env, postId: string): Promise<Response> {
    try {
        const formData = await request.formData();
        const isPublished = formData.get('is_published') ? (formData.get('is_published') === 'true' ? 1 : 0) : undefined;
        const imageFile = formData.get('image') as File | null;
        const deleteImage = formData.get('delete_image') === 'true';

        let imageUrl: string | undefined = undefined;

        if (deleteImage) {
            const oldPostResult = await queryD1(env, 'SELECT main_image_url FROM blog_posts WHERE id = ?', [postId]);
            const oldImageUrl = (oldPostResult.results[0] as { main_image_url: string })?.main_image_url;
            if (oldImageUrl) {
                const oldFileName = oldImageUrl.split('/').pop();
                if (oldFileName) await env.R2_BUCKET.delete(oldFileName);
            }
            imageUrl = '';
        } else if (imageFile) {
            const imageFileName = `${postId}_${imageFile.name}`;
            await env.R2_BUCKET.put(imageFileName, await imageFile.arrayBuffer());
            imageUrl = `https://${env.R2_BUCKET.name}.r2.dev/${imageFileName}`;
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (isPublished !== undefined) { updates.push('is_published = ?'); params.push(isPublished); }
        if (imageUrl !== undefined) { updates.push('main_image_url = ?'); params.push(imageUrl); }

        if (updates.length > 0) {
            params.push(postId);
            await queryD1(env, `UPDATE blog_posts SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        }

        // Cập nhật các bản dịch
        const languagesResult = await queryD1(env, 'SELECT id, code FROM languages WHERE is_active = 1');
        const activeLanguages = languagesResult.results as { id: number; code: string }[];

        for (const lang of activeLanguages) {
            const title = formData.get(`title_${lang.code}`) as string;
            const content = formData.get(`content_${lang.code}`) as string;
            const slug = formData.get(`slug_${lang.code}`) as string;

            if (title || content || slug) {
                await queryD1(
                    env,
                    `INSERT INTO blog_post_translations (blog_post_id, language_id, title, content, slug)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(blog_post_id, language_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        content = EXCLUDED.content,
                        slug = EXCLUDED.slug`,
                    [postId, lang.id, title, content, slug]
                );
            }
        }

        return jsonResponse({ message: 'Bài viết blog đã được cập nhật thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể cập nhật bài viết blog: ${error.message}`, 500);
    }
}

// Xóa bài viết blog
export async function deleteBlogPost(request: Request, env: Env, postId: string): Promise<Response> {
    try {
        const postResult = await queryD1(env, 'SELECT main_image_url FROM blog_posts WHERE id = ?', [postId]);
        const post = postResult.results[0] as { main_image_url: string };

        if (post && post.main_image_url) {
            const fileName = post.main_image_url.split('/').pop();
            if (fileName) {
                await env.R2_BUCKET.delete(fileName);
            }
        }

        await queryD1(env, 'DELETE FROM blog_posts WHERE id = ?', [postId]);
        return jsonResponse({ message: 'Bài viết blog đã được xóa thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể xóa bài viết blog: ${error.message}`, 500);
    }
}
