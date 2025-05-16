import express from "express";
import pool from "../config/db.js"
import { v2 as cloudinary } from 'cloudinary';
import multer from "multer";
import streamifier from "streamifier";
const imageUploadRoute = express.Router();

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
imageUploadRoute.post('/', upload.single('file'), async (req, res) => {
    const { userId } = req.body;

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
        await pool.query('UPDATE users SET picture = ? WHERE uid = ?', [result.secure_url, userId]);
        res.status(200).json({ success: true, imageUrl: result.secure_url });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ success: false, error: 'Image upload failed' });
    }
});

export default imageUploadRoute;
