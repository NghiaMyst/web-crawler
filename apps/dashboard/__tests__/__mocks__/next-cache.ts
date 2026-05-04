// Mock for 'next/cache' — revalidatePath is a Next.js runtime function not available in vitest.
// Tests that import server actions indirectly depend on this; we stub it as a no-op.
export const revalidatePath = (): void => {};
export const revalidateTag = (): void => {};
