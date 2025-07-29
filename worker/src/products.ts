// worker/src/products.ts
import { generateUUID, jsonResponse, errorResponse } from './utils';
import { queryD1 } from './db';

interface Env {
    DB: D1Database;
    R2_BUCKET: R2Bucket;
    R2_PUBLIC_URL: string; // Thêm R2_PUBLIC_URL
}

// Hàm trợ giúp để lấy ID ngôn ngữ từ code
async function getLanguageIdByCode(env: Env, code: string): Promise<number | null> {
    const langResult = await queryD1(env, 'SELECT id FROM languages WHERE code = ?', [code]);
    return langResult.results.length > 0 ? (langResult.results[0] as { id: number }).id : null;
}

// Lấy tất cả sản phẩm (có thể lọc theo ngôn ngữ)
export async function getProducts(_request: Request, env: Env): Promise<Response> {
    try {
        const url = new URL(_request.url);
        const langCode = url.searchParams.get('lang') || 'en'; // Ngôn ngữ mặc định
        const languageId = await getLanguageIdByCode(env, langCode);

        if (!languageId) {
            return errorResponse(`Mã ngôn ngữ '${langCode}' không tìm thấy.`, 404);
        }

        const productsResult = await queryD1(
            env,
            `SELECT
                p.id, p.sku, p.price, p.main_image_url, p.category, p.status,
                pt.name, pt.description, pt.slug
            FROM
                products p
            JOIN
                product_translations pt ON p.id = pt.product_id
            WHERE
                pt.language_id = ?`,
            [languageId]
        );

        return jsonResponse(productsResult.results);
    } catch (error: any) {
        return errorResponse(`Không thể lấy sản phẩm: ${error.message}`, 500);
    }
}

// Lấy sản phẩm theo ID (có thể lọc theo ngôn ngữ)
export async function getProductById(_request: Request, env: Env, productId: string): Promise<Response> {
    try {
        const url = new URL(_request.url);
        const langCode = url.searchParams.get('lang') || 'en';
        const languageId = await getLanguageIdByCode(env, langCode);

        if (!languageId) {
            return errorResponse(`Mã ngôn ngữ '${langCode}' không tìm thấy.`, 404);
        }

        const productResult = await queryD1(
            env,
            `SELECT
                p.id, p.sku, p.price, p.main_image_url, p.category, p.status,
                pt.name, pt.description, pt.slug
            FROM
                products p
            JOIN
                product_translations pt ON p.id = pt.product_id
            WHERE
                p.id = ? AND pt.language_id = ?`,
            [productId, languageId]
        );

        if (productResult.results.length === 0) {
            return errorResponse('Không tìm thấy sản phẩm', 404);
        }

        return jsonResponse(productResult.results[0]);
    } catch (error: any) {
        return errorResponse(`Không thể lấy sản phẩm: ${error.message}`, 500);
    }
}

// Thêm sản phẩm mới
export async function createProduct(request: Request, env: Env): Promise<Response> {
    try {
        const formData = await request.formData();
        const sku = formData.get('sku') as string;
        const price = parseFloat(formData.get('price') as string);
        const category = formData.get('category') as string;
        const status = formData.get('status') as string;
        const imageFile = formData.get('image') as File | null;

        if (!sku || isNaN(price)) {
            return errorResponse('SKU và Giá là bắt buộc', 400);
        }

        const productId = generateUUID();
        let imageUrl: string | null = null;

        if (imageFile) {
            const imageFileName = `${productId}_${imageFile.name}`;
            await env.R2_BUCKET.put(imageFileName, await imageFile.arrayBuffer());
            imageUrl = `${env.R2_PUBLIC_URL}/${imageFileName}`; // Sử dụng R2_PUBLIC_URL
        }

        await queryD1(
            env,
            'INSERT INTO products (id, sku, price, main_image_url, category, status) VALUES (?, ?, ?, ?, ?, ?)',
            [productId, sku, price, imageUrl, category, status]
        );

        // Xử lý các bản dịch
        const languagesResult = await queryD1(env, 'SELECT id, code FROM languages WHERE is_active = 1');
        const activeLanguages = languagesResult.results as { id: number; code: string }[];

        for (const lang of activeLanguages) {
            const name = formData.get(`name_${lang.code}`) as string;
            const description = formData.get(`description_${lang.code}`) as string;
            // Tạo slug mặc định nếu không có, hoặc sử dụng hàm tạo slug từ tên
            const slug = formData.get(`slug_${lang.code}`) as string || `${sku}-${lang.code}`;

            if (name) { // Chỉ thêm bản dịch nếu có tên
                await queryD1(
                    env,
                    'INSERT INTO product_translations (product_id, language_id, name, description, slug) VALUES (?, ?, ?, ?, ?)',
                    [productId, lang.id, name, description, slug]
                );
            }
        }

        return jsonResponse({ message: 'Sản phẩm đã được tạo thành công', productId, imageUrl }, 201);
    } catch (error: any) {
        return errorResponse(`Không thể tạo sản phẩm: ${error.message}`, 500);
    }
}

// Cập nhật sản phẩm
export async function updateProduct(request: Request, env: Env, productId: string): Promise<Response> {
    try {
        const formData = await request.formData();
        const price = formData.get('price') ? parseFloat(formData.get('price') as string) : undefined;
        const category = formData.get('category') as string | undefined;
        const status = formData.get('status') as string | undefined;
        const imageFile = formData.get('image') as File | null;
        const deleteImage = formData.get('delete_image') === 'true';

        let imageUrl: string | undefined = undefined;

        if (deleteImage) {
            // Xóa hình ảnh cũ nếu có
            const oldProductResult = await queryD1(env, 'SELECT main_image_url FROM products WHERE id = ?', [productId]);
            const oldImageUrl = (oldProductResult.results[0] as { main_image_url: string })?.main_image_url;
            if (oldImageUrl) {
                const oldFileName = oldImageUrl.split('/').pop();
                if (oldFileName) await env.R2_BUCKET.delete(oldFileName);
            }
            imageUrl = ''; // Đặt URL thành trống
        } else if (imageFile) {
            // Tải lên hình ảnh mới
            const imageFileName = `${productId}_${imageFile.name}`;
            await env.R2_BUCKET.put(imageFileName, await imageFile.arrayBuffer());
            imageUrl = `${env.R2_PUBLIC_URL}/${imageFileName}`; // Sử dụng R2_PUBLIC_URL
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (price !== undefined && !isNaN(price)) { updates.push('price = ?'); params.push(price); }
        if (category !== undefined) { updates.push('category = ?'); params.push(category); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }
        if (imageUrl !== undefined) { updates.push('main_image_url = ?'); params.push(imageUrl); }

        if (updates.length > 0) {
            params.push(productId);
            await queryD1(env, `UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        }

        // Cập nhật các bản dịch
        const languagesResult = await queryD1(env, 'SELECT id, code FROM languages WHERE is_active = 1');
        const activeLanguages = languagesResult.results as { id: number; code: string }[];

        for (const lang of activeLanguages) {
            const name = formData.get(`name_${lang.code}`) as string;
            const description = formData.get(`description_${lang.code}`) as string;
            const slug = formData.get(`slug_${lang.code}`) as string;

            // Kiểm tra xem có dữ liệu dịch nào được cung cấp cho ngôn ngữ này không
            if (name || description || slug) {
                // UPSERT (UPDATE OR INSERT) bản dịch
                await queryD1(
                    env,
                    `INSERT INTO product_translations (product_id, language_id, name, description, slug)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(product_id, language_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        slug = EXCLUDED.slug`,
                    [productId, lang.id, name, description, slug]
                );
            } else {
                // Tùy chọn: Nếu tất cả các trường dịch trống, bạn có thể xóa bản dịch đó
                // await queryD1(env, 'DELETE FROM product_translations WHERE product_id = ? AND language_id = ?', [productId, lang.id]);
            }
        }

        return jsonResponse({ message: 'Sản phẩm đã được cập nhật thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể cập nhật sản phẩm: ${error.message}`, 500);
    }
}

// Xóa sản phẩm
export async function deleteProduct(_request: Request, env: Env, productId: string): Promise<Response> {
    try {
        const productResult = await queryD1(env, 'SELECT main_image_url FROM products WHERE id = ?', [productId]);
        const product = productResult.results[0] as { main_image_url: string };

        if (product && product.main_image_url) {
            const fileName = product.main_image_url.split('/').pop();
            if (fileName) {
                await env.R2_BUCKET.delete(fileName);
            }
        }

        await queryD1(env, 'DELETE FROM products WHERE id = ?', [productId]);
        return jsonResponse({ message: 'Sản phẩm đã được xóa thành công' }, 200);
    } catch (error: any) {
        return errorResponse(`Không thể xóa sản phẩm: ${error.message}`, 500);
    }
}
