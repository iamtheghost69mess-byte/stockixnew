"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeProjectName = composeProjectName;
function composeProjectName(slug) {
    return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}
