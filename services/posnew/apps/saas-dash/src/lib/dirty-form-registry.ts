const dirtyIds = new Set<string>();

export function setFormDirty(id: string, isDirty: boolean): void {
	if (isDirty) dirtyIds.add(id);
	else dirtyIds.delete(id);
}

export function hasDirtyForms(): boolean {
	return dirtyIds.size > 0;
}
