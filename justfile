# Add local node bin to PATH for recipes
export PATH := "./node_modules/.bin:" + env_var('PATH')

# Default: display available recipes
_help:
    @just --list

# Install node modules
install *params:
    npm install {{params}}

# Run code linting
lint *params:
    eslint . {{params}}

# Run code linting and fix auto-fixable issues
lint-fix *params:
    eslint . --fix {{params}}

# Run TypeScript type checking (no emit)
typecheck:
    tsc --noEmit

# Run tests (Node built-in runner over TypeScript sources)
test *params:
    node --test {{params}} test/*.test.ts

# Compile TypeScript sources to dist/ and copy static UI assets
build:
    tsc -p tsconfig.build.json
    cp -R src/ui/assets dist/ui/

# Run the feed server from source (Node strips types natively)
start *params:
    node src/server.ts {{params}}

# Apply source license headers
license:
    source-licenser --config-file .licenser.yml ./
