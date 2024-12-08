const express = require('express');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const pool = require("../config/db");
const router = express.Router();

// Multer memory storage setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary configuration
cloudinary.config({
    cloud_name: 'dy4qacoxi',
    api_key: '345912752692594',
    api_secret: process.env.CLOUDINARY_SECRET,
});
console.log(process.env.CLOUDINARY_SECRET, "cloudinary secret");

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
