package app

import (
	"crypto/rand"
)

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
