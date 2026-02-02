package store

import (
	"context"
	"time"

	"github.com/minio/minio-go/v7"
)

// S3 wrappers methods

func (s *Store) EnsureBucket(ctx context.Context, bucketName string) error {
	// Check context before operation
	if err := ctx.Err(); err != nil {
		return err
	}
	exists, err := s.Minio.BucketExists(ctx, bucketName)
	if err == nil && !exists {
		// Use context for MakeBucket
		return s.Minio.MakeBucket(ctx, bucketName, minio.MakeBucketOptions{})
	}
	return err
}

func (s *Store) StatObject(ctx context.Context, bucket, key string) (minio.ObjectInfo, error) {
	if err := ctx.Err(); err != nil {
		return minio.ObjectInfo{}, err
	}
	return s.Minio.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
}

func (s *Store) RemoveObject(ctx context.Context, bucket, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return s.Minio.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{})
}

// PresignedPutObjectWithTimeout creates a presigned URL with a timeout
func (s *Store) PresignedPutObjectWithTimeout(ctx context.Context, bucket, key string, expiry time.Duration) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	url, err := s.Minio.PresignedPutObject(ctx, bucket, key, expiry)
	if err != nil {
		return "", err
	}
	return url.String(), nil
}

// PresignedGetObjectWithTimeout creates a presigned GET URL with a timeout
func (s *Store) PresignedGetObjectWithTimeout(ctx context.Context, bucket, key string, expiry time.Duration) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	url, err := s.Minio.PresignedGetObject(ctx, bucket, key, expiry, nil)
	if err != nil {
		return "", err
	}
	return url.String(), nil
}
