// worker/src/middleware.ts
import { errorResponse } from './utils';
import jwt from '@tsndr/cloudflare-worker-jwt';

interface Env {
    JWT_SECRET: string;
}

// Định nghĩa kiểu cho request đã được xác thực
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: string;
        exp: number; // Thời gian hết hạn của token
    };
}

// Middleware xác thực JWT
export async function authenticate(request: AuthenticatedRequest, env: Env): Promise<Response | null> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse('Token xác thực bị thiếu hoặc không đúng định dạng', 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const { payload } = await jwt.verify(token, env.JWT_SECRET);
        // Kiểm tra thời gian hết hạn của token
        if (payload.exp * 1000 < Date.now()) {
            return errorResponse('Token đã hết hạn', 401);
        }
        request.user = payload as AuthenticatedRequest['user'];
        return null; // Tiếp tục xử lý request
    } catch (error) {
        console.error("Lỗi xác minh JWT:", error);
        return errorResponse('Token không hợp lệ hoặc đã hết hạn', 401);
    }
}

// Middleware phân quyền dựa trên vai trò
export function authorize(requiredRole: 'admin' | 'editor'): (request: AuthenticatedRequest, env: Env) => Promise<Response | null> {
    return async (request: AuthenticatedRequest, env: Env) => {
        if (!request.user) {
            // Điều này không nên xảy ra nếu `authenticate` chạy trước
            return errorResponse('Yêu cầu xác thực', 401);
        }

        if (request.user.role !== requiredRole && request.user.role !== 'admin') {
            // Admin luôn có mọi quyền
            return errorResponse('Truy cập bị từ chối: Không đủ quyền', 403);
        }
        return null; // Người dùng có quyền, tiếp tục xử lý request
    };
}
