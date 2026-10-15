import { configDefaults, defineConfig } from 'vitest/config';

// Ajan worktree'leri (.claude/worktrees) repo içinde durur; onların testleri buraya karışmasın.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
