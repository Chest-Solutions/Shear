package app

import (
	"crypto/rand"
)

// NewID generates a short, unique id with the given prefix
// ("s" for sessions, "p" for peers, …).
func NewID(prefix string) string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, 10)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return prefix + "_" + string(b)
}

// DocumentID generates a short, unique, filesystem-safe document id.
func DocumentID() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return "d_" + string(b)
}
