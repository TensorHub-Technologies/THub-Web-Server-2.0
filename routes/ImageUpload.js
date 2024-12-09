const express = require('express');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const pool = require("../config/db");
const router = express.Router();

const MAX_FILE_SIZE = 1 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
});


// Cloudinary configuration
cloudinary.config({
    cloud_name: 'ds7idbzda',
    api_key: '315321374352922',
    api_secret: process.env.CLOUDINARY_SECRET || "HZTf5RB67U7Cz_BCC6prVC50sBg",
});

// Image upload endpoint
router.post('/', upload.single('file'), async (req, res) => {
    const { userId } = req.body;
    console.log(req.body, "image upload reqbody");

    if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'user_images' },
                    (error, result) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(error);
                        }
                    }
                );
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        const result = await streamUpload(file.buffer);

        console.log(result, "image result");

        await pool.query('UPDATE users SET picture = ? WHERE uid = ?', [result.secure_url, userId]);

        res.status(200).json({ success: true, imageUrl: result.secure_url });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ success: false, error: 'Image upload failed' });
    }
});

module.exports = router;
