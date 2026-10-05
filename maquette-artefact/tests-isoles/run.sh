#!/bin/sh
cd $(dirname $0)
rm -rf src && cp -r /tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/work/packages/core/src src
sed -e 's#"vitest"#"./vitest-shim"#' -e 's#"../src/#"./src/#' -e 's#"./helpers"#"./mkcore"#' /tmp/claude-0/-home-claude/f32c9d5d-51dc-59e6-9c7d-a5ae0e8f5c09/scratchpad/work/packages/core/test/$1 > t_$1
echo 'import {run} from "./vitest-shim"; run();' >> t_$1
tsx t_$1
