import { describe, expect, it } from 'vitest'
import { MovementSchema } from './movement'
import { CreateProductSchema, ProductSchema } from './product'
import { AppUserSchema, PERMISSIONS, type UserRole } from './user'

const uuid = '3f2b8c1e-6a4d-4e7b-9c2a-1d5e8f0a7b3c'

describe('ProductSchema', () => {
  const valid = {
    id: uuid,
    name: '  Leche entera ',
    category: 'Lácteos',
    currentQuantity: 4,
    minThreshold: 2,
    unit: 'L',
    costPrice: 28.5,
  }

  it('accepts a valid product and trims text', () => {
    expect(ProductSchema.parse(valid).name).toBe('Leche entera')
  })

  it('strips HTML/script injection from text fields', () => {
    const parsed = ProductSchema.parse({ ...valid, name: 'Moka<script>alert(1)</script><img src=x onerror=alert(1)>' })
    expect(parsed.name).not.toMatch(/<script|onerror/i)
    expect(parsed.name).toContain('Moka')
  })

  it('rejects negative stock and prices', () => {
    expect(ProductSchema.safeParse({ ...valid, currentQuantity: -1 }).success).toBe(false)
    expect(ProductSchema.safeParse({ ...valid, costPrice: -5 }).success).toBe(false)
  })

  it('rejects a name that is only spaces', () => {
    expect(ProductSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
  })

  it('does not ask for id or quantity when creating', () => {
    const input: Record<string, unknown> = { ...valid }
    delete input.id
    delete input.currentQuantity
    expect(CreateProductSchema.safeParse(input).success).toBe(true)
  })
})

describe('MovementSchema', () => {
  const valid = {
    id: uuid,
    productId: uuid,
    productName: 'Leche',
    type: 'out',
    quantity: 2,
    date: '2026-11-25T18:00:00Z',
    cost: 57,
  }

  it('accepts movements saved before registeredBy/category existed', () => {
    expect(MovementSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects zero quantities, unknown types and non-ISO dates', () => {
    expect(MovementSchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false)
    expect(MovementSchema.safeParse({ ...valid, type: 'transfer' }).success).toBe(false)
    expect(MovementSchema.safeParse({ ...valid, date: '25/11/2026' }).success).toBe(false)
  })
})

describe('AppUserSchema', () => {
  const valid = { id: uuid, username: 'ana', role: 'registrar', pinHash: 'a'.repeat(64), wrappedKey: 'abc' }

  it('requires a SHA-256 sized PIN hash and a known role', () => {
    expect(AppUserSchema.safeParse(valid).success).toBe(true)
    expect(AppUserSchema.safeParse({ ...valid, pinHash: 'short' }).success).toBe(false)
    expect(AppUserSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false)
  })
})

describe('PERMISSIONS', () => {
  const matrix: Record<UserRole, Record<keyof typeof PERMISSIONS, boolean>> = {
    admin: {
      canAddProduct: true,
      canDeleteProduct: true,
      canRegisterEntry: true,
      canRegisterOutput: true,
      canViewReports: true,
      canManageUsers: true,
    },
    registrar: {
      canAddProduct: false,
      canDeleteProduct: false,
      canRegisterEntry: true,
      canRegisterOutput: true,
      canViewReports: true,
      canManageUsers: false,
    },
    viewer: {
      canAddProduct: false,
      canDeleteProduct: false,
      canRegisterEntry: false,
      canRegisterOutput: false,
      canViewReports: true,
      canManageUsers: false,
    },
  }

  for (const [role, expected] of Object.entries(matrix) as [UserRole, Record<string, boolean>][]) {
    it(`gives ${role} exactly the expected permissions`, () => {
      const actual = Object.fromEntries(
        Object.entries(PERMISSIONS).map(([name, check]) => [name, (check as (r: UserRole) => boolean)(role)]),
      )
      expect(actual).toEqual(expected)
    })
  }
})
