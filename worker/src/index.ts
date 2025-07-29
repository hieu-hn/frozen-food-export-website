// worker/src/index.ts
import { Router, type IRequest } from 'itty-router';
import { errorResponse, jsonResponse } from './utils'; // Đã thêm lại jsonResponse nếu cần thiết cho các hàm khác
import { handleLogin, handleRegisterAdmin } from './auth';
import { authenticate, authorize, type AuthenticatedRequest } from './middleware';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct } from './products';
import { getBlogPosts, getBlogPostBySlug, createBlogPost, updateBlogPost, deleteBlogPost } from './blog';
import { getLanguages, createLanguage, updateLanguage, deleteLanguage } from './languages';
import { getUsers, createUser, updateUser, deleteUser } from './users';

// Mở rộng Env interface để bao gồm R2_PUBLIC_URL
interface Env {
    DB: D1Database;
    R2_BUCKET: R2Bucket;
    JWT_SECRET: string;
    TURNSTILE_SECRET_KEY: string;
    R2_PUBLIC_URL: string; // Thêm R2_PUBLIC_URL
}

// Định nghĩa một kiểu RequestHandler chung cho itty-router để bao gồm Env và params
// Các handler của itty-router có thể nhận request, env, và ctx
// Các hàm API của chúng ta thường chỉ nhận request và env, hoặc request, env, và một param ID
// Vì vậy, chúng ta sẽ định nghĩa AppHandler linh hoạt hơn
type AppHandler = (
    request: IRequest,
    env: Env,
    ctx?: ExecutionContext | string // ctx có thể là ExecutionContext hoặc một string ID (cho params)
) => Promise<Response>;

// Helper type để định nghĩa handler cho route có tham số
type ParamHandler = (request: IRequest, env: Env, param: string) => Promise<Response>;


const router = Router();

// Middleware CORS cho tất cả các request
router.options('*', (_request: Request) => {
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
router.post('/api/login', handleLogin as AppHandler);
router.get('/api/products', getProducts as AppHandler);
// Sử dụng hàm wrapper để truyền đúng tham số
router.get('/api/products/:id', (request: IRequest, env: Env) => getProductById(request, env, request.params.id as string));
router.get('/api/blog', getBlogPosts as AppHandler);
// Sử dụng hàm wrapper để truyền đúng tham số
router.get('/api/blog/:slug', (request: IRequest, env: Env) => getBlogPostBySlug(request, env, request.params.slug as string));
router.get('/api/languages', getLanguages as AppHandler);

// Admin routes (yêu cầu xác thực và phân quyền)

// Route để tạo người dùng admin ban đầu (chỉ chạy 1 lần hoặc trong môi trường dev)
// Sau khi tạo admin đầu tiên, bạn nên xóa hoặc bảo vệ route này cực kỳ cẩn thận!
router.post('/api/admin/register-initial-admin', handleRegisterAdmin as AppHandler);

// Sản phẩm (chỉ admin)
router.post('/api/admin/products', authenticate, authorize('admin'), createProduct as AppHandler);
router.put('/api/admin/products/:id', authenticate, authorize('admin'), (request: IRequest, env: Env) => updateProduct(request, env, request.params.id as string));
router.delete('/api/admin/products/:id', authenticate, authorize('admin'), (request: IRequest, env: Env) => deleteProduct(request, env, request.params.id as string));

// Blog (admin và editor)
router.post('/api/admin/blog', authenticate, authorize('editor'), async (request: AuthenticatedRequest, env: Env) => {
    // Gắn author_id từ người dùng đã xác thực vào formData
    const originalFormData = await request.formData();
    const newFormData = new FormData();
    for (const [key, value] of originalFormData.entries()) {
        // Kiểm tra kiểu của value trước khi append
        if (value instanceof File) {
            newFormData.append(key, value, value.name); // Đối với File, cần truyền filename
        } else {
            newFormData.append(key, value); // Đối với string
        }
    }
    if (request.user?.userId) {
        newFormData.append('author_id', request.user.userId);
    }
    // Tạo một Request mới với formData đã cập nhật
    const newRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: newFormData,
        // @ts-ignore - itty-router internal properties, params should be available
        params: request.params,
        // @ts-ignore
        user: request.user,
    });
    return createBlogPost(newRequest, env);
});

router.put('/api/admin/blog/:id', authenticate, authorize('editor'), (request: IRequest, env: Env) => updateBlogPost(request, env, request.params.id as string));
router.delete('/api/admin/blog/:id', authenticate, authorize('editor'), (request: IRequest, env: Env) => deleteBlogPost(request, env, request.params.id as string));

// Ngôn ngữ (chỉ admin)
router.post('/api/admin/languages', authenticate, authorize('admin'), createLanguage as AppHandler);
router.put('/api/admin/languages/:id', authenticate, authorize('admin'), (request: IRequest, env: Env) => updateLanguage(request, env, request.params.id as string));
router.delete('/api/admin/languages/:id', authenticate, authorize('admin'), (request: IRequest, env: Env) => deleteLanguage(request, env, request.params.id as string));

// Người dùng (chỉ admin)
router.get('/api/admin/users', authenticate, authorize('admin'), getUsers as AppHandler);
router.post('/api/admin/users', authenticate, authorize('admin'), createUser as AppHandler);
router.put('/api/admin/users/:id', authenticate, authorize('admin'), (request: IRequest, env: Env) => updateUser(request, env, request.params.id as string));
router.delete('/api/admin/users/:id', authenticate, authorize('admin'), (request: IRequest, env: Env) => deleteUser(request, env, request.params.id as string));


// Xử lý các route không khớp
router.all('*', () => errorResponse('Không tìm thấy', 404));

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return router.handle(request, env, ctx);
    },
};
