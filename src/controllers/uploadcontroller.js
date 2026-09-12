const multer = require('multer');
const path = require('path');
const fs = require('fs');

//  Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../../uploads/attachments');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Created uploads/attachments directory');
}

//  Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

//  Configure multer upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        cb(null, true); // Accept all file types
    }
});

//  Upload Controller Class
class UploadController {
    constructor() {
        this.uploadAttachment = this.uploadAttachment.bind(this);
    }

    async uploadAttachment(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            const fileUrl = `${req.protocol}://${req.get('host')}/uploads/attachments/${req.file.filename}`;

            console.log('✅ File uploaded:', req.file.filename);

            res.json({
                success: true,
                message: 'File uploaded successfully',
                fileUrl: fileUrl,
                fileName: req.file.originalname,
                fileSize: req.file.size
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Upload failed'
            });
        }
    }
}

//  Export controller and upload middleware
module.exports = {
    controller: new UploadController(),
    upload: upload.single('file')
};