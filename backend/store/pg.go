// store/pg.go
package store

import (
	"database/sql"
	"errors"
	"log"
	"time"

	"github.com/minio/minio-go/v7"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type Store struct {
	DB    *sql.DB
	Minio *minio.Client

	// Репозитории
	UserRepository *UserRepository
	DataRepository *DataRepository
}

func New(dbUrl string, minioClient *minio.Client) (*Store, error) {
	db, err := sql.Open("pgx", dbUrl)
	if err != nil {
		return nil, err
	}

	for i := 0; i < 5; i++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Printf("DB Ping failed (%d/5), waiting 2s...", i+1)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		return nil, errors.New("failed to connect to database after retries")
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	store := &Store{
		DB:    db,
		Minio: minioClient,
	}

	// Инициализация репозиториев
	store.UserRepository = NewUserRepository(db, minioClient)
	store.DataRepository = NewDataRepository(db)

	return store, nil
}

func (s *Store) Close() error {
	if s.DB != nil {
		return s.DB.Close()
	}
	return nil
}
