export const S3_PROVIDER_STORAGE_CLASS_OPTIONS: Record<string, string[]> = {
	AWS: [
		"STANDARD",
		"REDUCED_REDUNDANCY",
		"STANDARD_IA",
		"ONEZONE_IA",
		"GLACIER",
		"DEEP_ARCHIVE",
		"INTELLIGENT_TIERING",
		"GLACIER_IR",
	],
	Alibaba: ["STANDARD", "GLACIER", "STANDARD_IA"],
	ArvanCloud: ["STANDARD"],
	ChinaMobile: ["STANDARD", "GLACIER", "STANDARD_IA"],
	Liara: ["STANDARD"],
	Magalu: ["STANDARD", "GLACIER_IR"],
	Qiniu: ["STANDARD", "GLACIER", "LINE", "DEEP_ARCHIVE"],
	Scaleway: ["STANDARD", "GLACIER", "ONEZONE_IA"],
	TencentCOS: ["STANDARD", "STANDARD_IA", "ARCHIVE"],
};

export const getS3StorageClassOptionsByProvider = (provider?: string | null) => {
	if (!provider) {
		return [];
	}

	return S3_PROVIDER_STORAGE_CLASS_OPTIONS[provider] ?? [];
};
