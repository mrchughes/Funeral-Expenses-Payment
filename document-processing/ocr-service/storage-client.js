const Minio = require('minio');

class StorageClient {
    constructor(config) {
        this.bucketName = config.bucket || 'documents';
        this.client = new Minio.Client({
            endPoint: config.host || 'localhost',
            port: parseInt(config.port || '9000', 10),
            useSSL: config.useSSL || false,
            accessKey: config.accessKey || 'minioadmin',
            secretKey: config.secretKey || 'minioadmin'
        });
    }

    // Create and configure the MinIO client (static method for backward compatibility)
    static createMinioClient() {
        const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
        const minioPort = parseInt(process.env.MINIO_PORT || '9000', 10);
        const minioAccessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
        const minioSecretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
        const useSSL = process.env.MINIO_USE_SSL === 'true';

        return new Minio.Client({
            endPoint: minioEndpoint,
            port: minioPort,
            useSSL: useSSL,
            accessKey: minioAccessKey,
            secretKey: minioSecretKey,
        });
    }

    // Get a file from MinIO
    async getFile(objectName) {
        try {
            // Check if bucket exists, create it if it doesn't
            const bucketExists = await this.client.bucketExists(this.bucketName);
            if (!bucketExists) {
                await this.client.makeBucket(this.bucketName);
                console.log(`Bucket ${this.bucketName} created successfully.`);
            }

            // Get the file as a stream
            const dataStream = await this.client.getObject(this.bucketName, objectName);

            // Read the entire file as a buffer
            return new Promise((resolve, reject) => {
                const chunks = [];
                dataStream.on('data', (chunk) => chunks.push(chunk));
                dataStream.on('end', () => resolve(Buffer.concat(chunks)));
                dataStream.on('error', (err) => reject(err));
            });
        } catch (err) {
            console.error(`Error retrieving file ${objectName} from bucket ${this.bucketName}:`, err);
            throw err;
        }
    }

    // Save a file to MinIO
    async saveFile(objectName, data, metadata = {}) {
        try {
            // Check if bucket exists, create it if it doesn't
            const bucketExists = await this.client.bucketExists(this.bucketName);
            if (!bucketExists) {
                await this.client.makeBucket(this.bucketName);
                console.log(`Bucket ${this.bucketName} created successfully.`);
            }

            // Upload the file
            await this.client.putObject(this.bucketName, objectName, data, metadata);
            console.log(`File ${objectName} uploaded successfully to bucket ${this.bucketName}.`);
        } catch (err) {
            console.error(`Error saving file ${objectName} to bucket ${this.bucketName}:`, err);
            throw err;
        }
    }

    // Get file metadata from MinIO
    async getFileMetadata(objectName) {
        try {
            const statObject = await this.client.statObject(this.bucketName, objectName);
            return statObject;
        } catch (err) {
            console.error(`Error retrieving metadata for file ${objectName} from bucket ${this.bucketName}:`, err);
            throw err;
        }
    }

    // List files in a bucket
    async listFiles(prefix = '') {
        try {
            const objectsStream = this.client.listObjectsV2(this.bucketName, prefix, true);
            const objects = [];

            return new Promise((resolve, reject) => {
                objectsStream.on('data', (obj) => {
                    objects.push(obj);
                });

                objectsStream.on('error', (err) => {
                    reject(err);
                });

                objectsStream.on('end', () => {
                    resolve(objects);
                });
            });
        } catch (err) {
            console.error(`Error listing files in bucket ${this.bucketName}:`, err);
            throw err;
        }
    }
}

// Export the StorageClient class
module.exports = StorageClient;
