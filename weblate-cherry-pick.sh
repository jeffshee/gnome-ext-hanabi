#!/bin/bash

FROM_COMMIT="356f9ccb42267665ce00ca752c806b51e72539a9"

git log master --committer="weblate" --oneline --format="%h" --reverse "$FROM_COMMIT".. | xargs -n 1 git cherry-pick
