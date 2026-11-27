/**
 * Firestore Security Rules Verification Harness (Phase 0 TDD — Dirty Dozen)
 * Verifies that all 12 adversarial payloads in security_spec.md are denied
 * by firestore.rules when executed against the Firebase Emulator Suite.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  actor: 'anonymous' | 'regularUser' | 'unverifiedAdmin' | 'verifiedAdmin';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Product Create',
    actor: 'verifiedAdmin',
    operation: 'create',
    path: 'products/prod-shadow-01',
    payload: {
      id: 'prod-shadow-01',
      slug: 'shadow-test',
      title: 'Shadow Test',
      category: 'E-Book',
      price: 50000,
      stock: 10,
      unlimitedStock: false,
      shortDescription: 'Desc',
      description: 'Full desc',
      highlights: ['Point 1'],
      format: 'PDF',
      fileSize: '10 KB',
      fileName: 'test.pdf',
      fileKey: 'key-1',
      coverImage: '/cover.jpg',
      status: 'active',
      featured: false,
      salesCount: 0,
      ghostField: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof on Orders',
    actor: 'unverifiedAdmin',
    operation: 'get',
    path: 'orders/ord-existing-01',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-Assigned Admin Escalation',
    actor: 'regularUser',
    operation: 'create',
    path: 'admins/regular-user-uid',
    payload: {
      uid: 'regular-user-uid',
      email: 'attacker@example.com',
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'PII Blanket Read Attack on Orders',
    actor: 'regularUser',
    operation: 'get',
    path: 'orders/ord-existing-01',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'OrderStatus Collection Enumeration (List Scraping)',
    actor: 'anonymous',
    operation: 'list',
    path: 'orderStatuses',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Payment Forgery on Order Create (Status PAID)',
    actor: 'anonymous',
    operation: 'create',
    path: 'orders/ord-forged-paid',
    payload: {
      id: 'ord-forged-paid',
      invoiceCode: 'INV-2026-9999',
      buyerSecret: 'secret-1234567890abcdef',
      customerName: 'Attacker',
      customerEmail: 'attacker@example.com',
      customerPhone: '081234567890',
      paymentMethod: 'telegram_bank',
      paymentReference: 'TELEGRAM_BANK-1234',
      items: [{ productId: 'prod-1', title: 'Test', price: 10000, quantity: 1, fileName: 'a.pdf' }],
      totalAmount: 10000,
      status: 'PAID',
      downloadToken: 'forged',
      telegramStatus: 'pending',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Buyer Payment Forgery on OrderStatus Update (downloadReady: true)',
    actor: 'anonymous',
    operation: 'update',
    path: 'orderStatuses/ord-existing-01',
    payload: {
      status: 'PAID',
      downloadReady: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Buyer Secret Spoofing on Transfer Proof Update',
    actor: 'anonymous',
    operation: 'update',
    path: 'orders/ord-existing-01',
    payload: {
      buyerSecret: 'wrong-secret-0000000000',
      status: 'PAYMENT_SUBMITTED',
      transferProofNote: 'Fake transfer',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal State Tampering on PAID Order',
    actor: 'anonymous',
    operation: 'update',
    path: 'orders/ord-already-paid',
    payload: {
      status: 'PENDING',
      transferProofNote: 'Re-open paid order',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Orphaned Order Create Without Atomic OrderStatus',
    actor: 'anonymous',
    operation: 'create',
    path: 'orders/ord-orphan-01',
    payload: {
      id: 'ord-orphan-01',
      invoiceCode: 'INV-2026-8888',
      buyerSecret: 'secret-abcdef1234567890',
      customerName: 'Orphan Buyer',
      customerEmail: 'orphan@example.com',
      customerPhone: '081234567890',
      paymentMethod: 'telegram_bank',
      paymentReference: 'TELEGRAM_BANK-8888',
      items: [{ productId: 'prod-1', title: 'Test', price: 10000, quantity: 1, fileName: 'a.pdf' }],
      totalAmount: 10000,
      status: 'AWAITING_BANK',
      downloadToken: 'tok-12345678',
      telegramStatus: 'pending',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Backdated Client Timestamp Forgery',
    actor: 'verifiedAdmin',
    operation: 'create',
    path: 'telegramLogs/log-backdated',
    payload: {
      id: 'log-backdated',
      timestamp: '2020-01-01T00:00:00Z',
      event: 'test',
      status: 'sent',
      detail: 'Forged timestamp',
      preview: 'Forged',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Resource Poisoning (Oversized transferProofNote & Invalid Doc ID)',
    actor: 'anonymous',
    operation: 'create',
    path: 'orders/invalid id with spaces and $pecial chars',
    payload: {
      transferProofNote: 'A'.repeat(5000),
    },
    expected: 'PERMISSION_DENIED',
  },
];
