-- migrations/0001_initial_schema.sql

-- Bảng languages: Quản lý các ngôn ngữ có sẵn
CREATE TABLE IF NOT EXISTS languages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL, -- Mã ngôn ngữ (e.g., 'en', 'vi', 'zh')
    name TEXT NOT NULL,        -- Tên hiển thị (e.g., 'English', 'Tiếng Việt')
    is_active INTEGER DEFAULT 1 -- 1: active, 0: inactive
);

-- Bảng users: Quản lý người dùng và quyền hạn
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- UUID
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin', 'editor'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Bảng products: Thông tin sản phẩm không phụ thuộc ngôn ngữ
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, -- UUID
    sku TEXT UNIQUE,
    price REAL NOT NULL,
    main_image_url TEXT, -- URL hình ảnh chính (từ R2)
    category TEXT,       -- Ví dụ: 'Frozen Seafood', 'Frozen Vegetables'
    status TEXT DEFAULT 'available', -- 'available', 'out_of_stock', 'draft'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Bảng product_translations: Nội dung đã dịch của sản phẩm
CREATE TABLE IF NOT EXISTS product_translations (
    product_id TEXT NOT NULL,
    language_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT UNIQUE NOT NULL, -- URL thân thiện với SEO cho ngôn ngữ này
    PRIMARY KEY (product_id, language_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

-- Bảng blog_posts: Thông tin bài viết blog không phụ thuộc ngôn ngữ
CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY, -- UUID
    author_id TEXT NOT NULL,
    main_image_url TEXT, -- URL hình ảnh chính (từ R2)
    published_at TEXT, -- Ngày xuất bản
    is_published INTEGER DEFAULT 0, -- 1: published, 0: draft
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Bảng blog_post_translations: Nội dung đã dịch của bài viết blog
CREATE TABLE IF NOT EXISTS blog_post_translations (
    blog_post_id TEXT NOT NULL,
    language_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    slug TEXT UNIQUE NOT NULL, -- URL thân thiện với SEO cho ngôn ngữ này
    PRIMARY KEY (blog_post_id, language_id),
    FOREIGN KEY (blog_post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

-- Thêm một số ngôn ngữ mặc định (ví dụ)
INSERT OR IGNORE INTO languages (code, name, is_active) VALUES ('en', 'English', 1);
INSERT OR IGNORE INTO languages (code, name, is_active) VALUES ('vi', 'Tiếng Việt', 1);
-- Bạn có thể thêm các ngôn ngữ khác sau này từ admin hoặc thêm vào đây
-- INSERT OR IGNORE INTO languages (code, name, is_active) VALUES ('zh', '中文', 1);
-- INSERT OR IGNORE INTO languages (code, name, is_active) VALUES ('ko', '한국어', 1);

-- Thêm một người dùng admin mặc định (để bạn có thể đăng nhập lần đầu)
-- LƯU Ý: Thay đổi mật khẩu này trong môi trường production!
INSERT OR IGNORE INTO users (id, email, hashed_password, role) VALUES (
    'admin-uuid-12345', -- Một UUID duy nhất
    'admin@example.com',
    'hashed_password_placeholder', -- Bạn cần hash mật khẩu thực tế trong Worker khi tạo người dùng
    'admin'
);