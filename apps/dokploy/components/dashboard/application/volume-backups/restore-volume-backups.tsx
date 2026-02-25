import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import copy from "copy-to-clipboard";
import { debounce } from "lodash";
import {
	CheckIcon,
	ChevronsUpDown,
	Copy,
	InfoIcon,
	RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";
import { formatBytes } from "../../database/backups/restore-backup";
import { type LogLine, parseLogs } from "../../docker/logs/utils";

interface Props {
	id: string;
	type: "application" | "compose";
	serverId?: string;
}

type BackupFileListItem = RouterOutputs["backup"]["listBackupFiles"][number] & {
	RestoreAvailability?: "ready" | "restoring" | "archived" | "unknown";
	StorageClass?: string;
	RestoreExpiryDate?: string | null;
};

const RestoreBackupSchema = z.object({
	destinationId: z
		.string({
			required_error: "Please select a destination",
		})
		.min(1, {
			message: "Destination is required",
		}),
	backupFile: z
		.string({
			required_error: "Please select a backup file",
		})
		.min(1, {
			message: "Backup file is required",
		}),
	volumeName: z
		.string({
			required_error: "Please enter a volume name",
		})
		.min(1, {
			message: "Volume name is required",
	}),
});

const getAvailabilityBadge = (
	availability?: "ready" | "restoring" | "archived" | "unknown",
) => {
	if (availability === "ready") {
		return <Badge variant="default">Ready</Badge>;
	}
	if (availability === "restoring") {
		return <Badge variant="secondary">Restoring</Badge>;
	}
	if (availability === "archived") {
		return <Badge variant="destructive">Archived</Badge>;
	}
	return <Badge variant="outline">Unknown</Badge>;
};

export const RestoreVolumeBackups = ({ id, type, serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

	const { data: destinations = [] } = api.destination.all.useQuery();

	const form = useForm<z.infer<typeof RestoreBackupSchema>>({
		defaultValues: {
			destinationId: "",
			backupFile: "",
			volumeName: "",
		},
		resolver: zodResolver(RestoreBackupSchema),
	});

	const destinationId = form.watch("destinationId");
	const volumeName = form.watch("volumeName");
	const backupFile = form.watch("backupFile");

	const debouncedSetSearch = debounce((value: string) => {
		setDebouncedSearchTerm(value);
	}, 350);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		debouncedSetSearch(value);
	};

	const {
		data: filesData = [],
		isLoading,
		refetch: refetchFiles,
	} = api.backup.listBackupFiles.useQuery(
		{
			destinationId: destinationId,
			search: debouncedSearchTerm,
			serverId: serverId ?? "",
		},
		{
			enabled: isOpen && !!destinationId,
		},
	);
	const files = filesData as BackupFileListItem[];

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	const [archiveRetrievalTier, setArchiveRetrievalTier] = useState<
		"standard" | "priority" | "bulk"
	>("standard");
	const [archiveLifetimeDays, setArchiveLifetimeDays] = useState("7");
	const selectedFile = files.find((file) => file.Path === backupFile);
	const isSelectedFileRestorable =
		selectedFile && !selectedFile.IsDir
			? selectedFile.RestoreAvailability === "ready" ||
				selectedFile.RestoreAvailability === "unknown"
			: true;

	api.volumeBackups.restoreVolumeBackupWithLogs.useSubscription(
		{
			id,
			serviceType: type,
			serverId,
			destinationId,
			volumeName,
			backupFileName: backupFile,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === "Restore completed successfully!") {
					setIsDeploying(false);
				}
				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError(error) {
				console.error("Restore logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	const trpcUtils = api.useUtils();
	const requestArchiveRestore = useMutation({
		mutationFn: (input: {
			destinationId: string;
			backupFile: string;
			retrievalTier: "standard" | "priority" | "bulk";
			lifetimeDays: number;
			serverId?: string;
		}) =>
			trpcUtils.client.mutation(
				"backup.requestBackupFileRestore" as never,
				input as never,
			),
		onSuccess(data) {
			toast.success((data as { message?: string })?.message ?? "Restore requested.");
			void refetchFiles();
		},
		onError(error) {
			toast.error(error instanceof Error ? error.message : "Failed to request restore");
		},
	});

	const onSubmit = async () => {
		setIsDeploying(true);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<RotateCcw className="mr-2 size-4" />
					Restore Volume Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<RotateCcw className="mr-2 size-4" />
						Restore Volume Backup
					</DialogTitle>
					<DialogDescription>
						Select a destination and search for volume backup files
					</DialogDescription>
					<AlertBlock>
						Make sure the volume name is not being used by another container.
					</AlertBlock>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-restore-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="destinationId"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel>Destination</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{field.value
														? destinations.find(
																(d) => d.destinationId === field.value,
															)?.name
														: "Select Destination"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search destinations..."
													className="h-9"
												/>
												<CommandEmpty>No destinations found.</CommandEmpty>
												<ScrollArea className="h-64">
													<CommandGroup>
														{destinations.map((destination) => (
															<CommandItem
																value={destination.destinationId}
																key={destination.destinationId}
																onSelect={() => {
																	form.setValue(
																		"destinationId",
																		destination.destinationId,
																	);
																}}
															>
																{destination.name}
																<CheckIcon
																	className={cn(
																		"ml-auto h-4 w-4",
																		destination.destinationId === field.value
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
															</CommandItem>
														))}
													</CommandGroup>
												</ScrollArea>
											</Command>
										</PopoverContent>
									</Popover>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="backupFile"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="flex items-center">
										Search Backup Files
										{field.value && (
											<Badge variant="outline" className="truncate w-52">
												{field.value}
												<Copy
													className="ml-2 size-4 cursor-pointer"
													onClick={(e) => {
														e.stopPropagation();
														e.preventDefault();
														copy(field.value);
														toast.success("Backup file copied to clipboard");
													}}
												/>
											</Badge>
										)}
									</FormLabel>
									<Popover modal>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"h-10 w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													<span className="block flex-1 truncate whitespace-nowrap text-left">
														{field.value || "Search and select a backup file"}
													</span>
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search backup files..."
													value={search}
													onValueChange={handleSearchChange}
													className="h-9"
												/>
												{isLoading ? (
													<div className="py-6 text-center text-sm">
														Loading backup files...
													</div>
												) : files.length === 0 && search ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														No backup files found for "{search}"
													</div>
												) : files.length === 0 ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														No backup files available
													</div>
												) : (
													<ScrollArea className="h-64">
														<CommandGroup className="w-96">
															{files?.map((file) => (
																<CommandItem
																	value={file.Path}
																	key={file.Path}
																	onSelect={() => {
																		form.setValue("backupFile", file.Path);
																		if (file.IsDir) {
																			setSearch(`${file.Path}/`);
																			setDebouncedSearchTerm(`${file.Path}/`);
																		} else {
																			setSearch(file.Path);
																			setDebouncedSearchTerm(file.Path);
																		}
																	}}
																>
																	<div className="flex w-full flex-col gap-1">
																		<div className="flex w-full justify-between">
																			<span className="font-medium">
																				{file.Path}
																			</span>

																			<CheckIcon
																				className={cn(
																					"ml-auto h-4 w-4",
																					file.Path === field.value
																						? "opacity-100"
																						: "opacity-0",
																				)}
																			/>
																		</div>
																		<div className="flex items-center gap-4 text-xs text-muted-foreground">
																			<span>
																				Size: {formatBytes(file.Size)}
																			</span>
																			{file.StorageClass && (
																				<span>Class: {file.StorageClass}</span>
																			)}
																			{!file.IsDir &&
																				getAvailabilityBadge(file.RestoreAvailability)}
																			{file.IsDir && (
																				<span className="text-blue-500">
																					Directory
																				</span>
																			)}
																			{file.Hashes?.MD5 && (
																				<span>MD5: {file.Hashes.MD5}</span>
																			)}
																			{file.RestoreExpiryDate && (
																				<span>
																					Readable until:{" "}
																					{new Date(
																						file.RestoreExpiryDate,
																					).toLocaleString()}
																				</span>
																			)}
																		</div>
																	</div>
																</CommandItem>
															))}
														</CommandGroup>
													</ScrollArea>
												)}
											</Command>
										</PopoverContent>
									</Popover>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="volumeName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Volume Name</FormLabel>
									<FormControl>
										<Input placeholder="Enter volume name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								isLoading={isDeploying}
								form="hook-form-restore-backup"
								type="submit"
								disabled={!backupFile || !isSelectedFileRestorable}
							>
								Restore
							</Button>
						</DialogFooter>
						{selectedFile?.RestoreAvailability === "archived" && (
							<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
								<div className="mb-2 flex items-center gap-1 text-xs font-medium text-destructive">
									<span>Archived backup file</span>
									<TooltipProvider>
										<Tooltip delayDuration={0}>
											<TooltipTrigger>
												<InfoIcon className="h-4 w-4 text-muted-foreground" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs">
												This backup is in archive storage and cannot be
												downloaded until restore is requested. Retrieval speed:
												Standard is typical, Priority is fastest, Bulk is
												lowest-cost but slowest. Lifetime controls how long the
												object stays readable after restore completes.
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<p className="mb-2 text-xs text-muted-foreground">
									Request restore to make this backup temporarily readable.
								</p>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
									<Select
										value={archiveRetrievalTier}
										onValueChange={(value: "standard" | "priority" | "bulk") =>
											setArchiveRetrievalTier(value)
										}
									>
										<SelectTrigger className="h-8 w-full sm:w-36">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="standard">Standard</SelectItem>
											<SelectItem value="priority">Priority</SelectItem>
											<SelectItem value="bulk">Bulk</SelectItem>
										</SelectContent>
									</Select>
									<Select
										value={archiveLifetimeDays}
										onValueChange={setArchiveLifetimeDays}
									>
										<SelectTrigger className="h-8 w-full sm:w-32">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="1">1 day</SelectItem>
											<SelectItem value="3">3 days</SelectItem>
											<SelectItem value="7">7 days</SelectItem>
											<SelectItem value="14">14 days</SelectItem>
											<SelectItem value="30">30 days</SelectItem>
										</SelectContent>
									</Select>
									<Button
										type="button"
										variant="secondary"
										className="h-8 sm:w-auto"
										isLoading={requestArchiveRestore.isPending}
										onClick={() => {
											if (!selectedFile) return;
											requestArchiveRestore.mutate({
												destinationId,
												backupFile: selectedFile.Path,
												retrievalTier: archiveRetrievalTier,
												lifetimeDays: Number.parseInt(archiveLifetimeDays, 10),
												serverId: serverId ?? undefined,
											});
										}}
									>
										Request Restore
									</Button>
								</div>
								<p className="mt-2 text-xs text-destructive">
									This object is archived and not readable yet.
								</p>
							</div>
						)}
						{selectedFile?.RestoreAvailability === "restoring" && (
							<p className="text-xs text-muted-foreground">
								This backup is being restored from archive and is not readable yet.
							</p>
						)}
					</form>
				</Form>

				<DrawerLogs
					isOpen={isDrawerOpen}
					onClose={() => {
						setIsDrawerOpen(false);
						setFilteredLogs([]);
						setIsDeploying(false);
						// refetch();
					}}
					filteredLogs={filteredLogs}
				/>
			</DialogContent>
		</Dialog>
	);
};
