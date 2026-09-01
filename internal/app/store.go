package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Store persists documents as JSON files on disk (data/<id>.json).
type Store struct {
	mu    sync.RWMutex
	dir   string
	cache map[string]Document
}

// NewStore opens the store at dir, loading existing documents.
func NewStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	s := &Store{dir: dir, cache: map[string]Document{}}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		b, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var d Document
		if err := json.Unmarshal(b, &d); err != nil {
			continue
		}
		if d.ID == "" {
			d.ID = id
		}
		s.cache[d.ID] = d
	}
	return s, nil
}

func slugID(s string) string {
	var out []rune
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			out = append(out, r)
		} else if unicode.IsSpace(r) || r == '-' {
			if len(out) > 0 && out[len(out)-1] != '-' {
				out = append(out, '-')
			}
		}
	}
	return string(out)
}

func (s *Store) putFile(d Document) error {
	name := filepath.Join(s.dir, d.ID+".json")
	b, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return err
	}
	tmp := name + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, name)
}

// Put upserts a document.
func (s *Store) Put(d Document) error {
	if d.ID == "" {
		d.ID = DocumentID()
	}
	d.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := d.Validate(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.putFile(d); err != nil {
		return err
	}
	s.cache[d.ID] = d
	return nil
}

// Get returns a stored document.
func (s *Store) Get(id string) (*Document, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	d, ok := s.cache[id]
	if !ok {
		return nil, false
	}
	cp := d.Clone()
	return &cp, true
}

// Summary is a lightweight view of a stored document.
type Summary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
	Scenes    int    `json:"scenes"`
}

// List returns all stored documents, most recently updated first.
func (s *Store) List() []Summary {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Summary, 0, len(s.cache))
	for _, d := range s.cache {
		out = append(out, Summary{ID: d.ID, Name: d.Name, UpdatedAt: d.UpdatedAt, Scenes: len(d.Scenes)})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out
}

// Delete removes a stored document.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.cache[id]; !ok {
		return fmt.Errorf("document not found")
	}
	if err := os.Remove(filepath.Join(s.dir, id+".json")); err != nil && !os.IsNotExist(err) {
		return err
	}
	delete(s.cache, id)
	return nil
}
