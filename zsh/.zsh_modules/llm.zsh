# # Context every Ollama model runs with. Ollama's default (as small as 4K) is too small for pi.
# # Set OLLAMA_CONTEXT_LENGTH before this module loads to override it.
# export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-16384}"
#
# # (Re)starts the Homebrew Ollama service with OLLAMA_CONTEXT_LENGTH. The service does not read the
# # shell environment, and launchctl setenv is lost on reboot, so run this instead of brew services.
# ollama-start() {
#     local cmd
#     for cmd in brew launchctl; do
#         if ! command -v "$cmd" >/dev/null 2>&1; then
#             echo "ollama-start: required command not found: $cmd" >&2
#             return 1
#         fi
#     done
#
#     launchctl setenv OLLAMA_CONTEXT_LENGTH "$OLLAMA_CONTEXT_LENGTH" || return 1
#     brew services restart ollama || return 1
#     echo "Ollama started with OLLAMA_CONTEXT_LENGTH=$OLLAMA_CONTEXT_LENGTH; check the CONTEXT column of 'ollama ps' after loading a model."
# }
#
# # launchd forgets the value on reboot or logout, so the first interactive shell afterwards sets it
# # again. If brew services already started Ollama with the default, restart it; otherwise only set
# # the value so a later brew services start uses it. An existing value is left alone, which keeps a
# # one-off OLLAMA_CONTEXT_LENGTH=... ollama-start in place.
# if [[ -o interactive && "$OSTYPE" == darwin* ]] && command -v launchctl >/dev/null 2>&1 \
#     && [[ -z "$(launchctl getenv OLLAMA_CONTEXT_LENGTH)" ]]; then
#     if pgrep -x ollama >/dev/null 2>&1; then
#         ollama-start
#     else
#         launchctl setenv OLLAMA_CONTEXT_LENGTH "$OLLAMA_CONTEXT_LENGTH"
#     fi
# fi
