// worker/src/index.ts
import { Router, IRequest } from 'itty-router';
import { jsonResponse, errorResponse } from './utils';
import { handleLogin, handleRegisterAdmin } from './auth';
import { authenticate, authorize, AuthenticatedRequest } from './middleware';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct } from './products';
import { getBlogPosts, getBlogPostBySlug, createBlogPost, updateBlogPost, deleteBlogPost } from './blog';
import { getLanguages, createLanguage, updateLanguage, deleteLanguage } from './languages';
import { getUsers, createUser, updateUser, deleteUser } from './users';

interface Env {
    DB: D1Database;
    R2_BUCKET: R2Bucket;
    JWT_SECRET: string;
    TURNSTILE_SECRET_KEY: string; // Khai báo Turnstile secret key
}

const router = Router();

// Middleware CORS cho tất cả các request
router.options('*', (request: Request) => {
    return new Response(null, {
        status: 204,
        headers: {
            // Cấu hình chính xác cho domain frontend của bạn trong production
            // Ví dụ: 'Access-Control-Allow-Origin': 'https://your-frontend-domain.pages.dev',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
});

// Public routes (không yêu cầu xác thực)
router.post('/api/login', handleLogin);
router.get('/api/products', getProducts);
router.get('/api/products/:id', getProductById); // Lấy sản phẩm theo ID
router.get('/api/blog', getBlogPosts);
router.get('/api/blog/:slug', getBlogPostBySlug); // Lấy bài viết blog theo slug
router.get('/api/languages', getLanguages); // Lấy danh sách ngôn ngữ

// Admin routes (yêu cầu xác thực và phân quyền)

// Route để tạo người dùng admin ban đầu (chỉ chạy 1 lần hoặc trong môi trường dev)
// Sau khi tạo admin đầu tiên, bạn nên xóa hoặc bảo vệ route này cực kỳ cẩn thận!
router.post('/api/admin/register-initial-admin', handleRegisterAdmin);

// Sản phẩm (chỉ admin)
router.post('/api/admin/products', authenticate, authorize('admin'), createProduct);
router.put('/api/admin/products/:id', authenticate, authorize('admin'), (request: AuthenticatedRequest, env: Env) => updateProduct(request, env, request.params.id as string));
router.delete('/api/admin/products/:id', authenticate, authorize('admin'), (request: AuthenticatedRequest, env: Env) => deleteProduct(request, env, request.params.id as string));

// Blog (admin và editor)
router.post('/api/admin/blog', authenticate, authorize('editor'), (request: AuthenticatedRequest, env: Env) => {
    // Gắn author_id từ người dùng đã xác thực
    (request as any).formData().append('author_id', request.user?.userId);
    return createBlogPost(request, env);
});
router.put('/api/admin/blog/:id', authenticate, authorize('editor'), (request: AuthenticatedRequest, env: Env) => updateBlogPost(request, env, request.params.id as string));
router.delete('/api/admin/blog/:id', authenticate, authorize('editor'), (request: AuthenticatedRequest, env: Env) => deleteBlogPost(request, env, request.params.id as string));

// Ngôn ngữ (chỉ admin)
router.post('/api/admin/languages', authenticate, authorize('admin'), createLanguage);
router.put('/api/admin/languages/:id', authenticate, authorize('admin'), (request: AuthenticatedRequest, env: Env) => updateLanguage(request, env, request.params.id as string));
router.delete('/api/admin/languages/:id', authenticate, authorize('admin'), (request: AuthenticatedRequest, env: Env) => deleteLanguage(request, env, request.params.id as string));

// Người dùng (chỉ admin)
router.get('/api/admin/users', authenticate, authorize('admin'), getUsers);
router.post('/api/admin/users', authenticate, authorize('admin'), createUser);
router.put('/api/admin/users/:id', authenticate, authorize('admin'), (request: AuthenticatedRequest, env: Env) => updateUser(request, env, request.params.id as string));
router.delete('/api/admin/users/:id', authenticate, authorize('admin'), (request: AuthenticatedRequest, env: Env) => deleteUser(request, env, request.params.id as string));


// Xử lý các route không khớp
router.all('*', () => errorResponse('Không tìm thấy', 404));

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
};
