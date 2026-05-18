import readline from "node:readline";

type ValidateInput = (value: string) => boolean | string;
type PromptQuestion = (query: string) => Promise<string>;
export type PromptLinePrinter = (line: string) => void;

interface PromptOption<T extends string> {
	hint?: string;
	label: string;
	value: T;
}

/**
 * Prompt adapter used by CLI scaffold flows and migration wizard flows.
 */
export interface ReadlinePrompt {
	close(): void;
	select<T extends string>(message: string, options: PromptOption<T>[], defaultValue?: number): Promise<T>;
	text(message: string, defaultValue: string, validate?: ValidateInput): Promise<string>;
}

/**
 * Output adapters used by prompt rendering and validation feedback.
 */
export interface ReadlinePromptOutput {
	/** Render one informational prompt line. */
	printLine?: PromptLinePrinter;
	/** Render one validation or selection error line. */
	errorLine?: PromptLinePrinter;
}

/**
 * Adapter interface for readline-style prompt interactions.
 *
 * Public CLI code uses the native readline implementation, while tests can
 * substitute lightweight doubles that expose the same `question` and `close`
 * methods.
 */
export interface ReadlineQuestionAdapter {
	/** Close the underlying prompt interface and release any open handles. */
	close(): void;
	/**
	 * Render one prompt and resolve with the collected answer string.
	 *
	 * @param query Prompt text written to the active output stream.
	 * @param callback Callback that receives the entered answer.
	 */
	question(query: string, callback: (answer: string) => void): void;
}

/**
 * Create the default readline-backed prompt implementation for the CLI.
 *
 * @param output Optional line printers for prompt and validation output.
 * @returns A prompt adapter that reads from stdin and writes to stdout.
 */
export function createReadlinePrompt(output: ReadlinePromptOutput = {}): ReadlinePrompt {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return createReadlinePromptWithInterface(rl, output);
}

/**
 * Build a prompt adapter around a supplied readline-style question interface.
 *
 * This keeps the production CLI path unchanged while letting tests validate
 * retry behavior without stubbing global stdin/stdout.
 *
 * @param rl Readline-compatible question adapter.
 * @param output Optional line printers for prompt and validation output.
 */
export function createReadlinePromptWithInterface(
	rl: ReadlineQuestionAdapter,
	output: ReadlinePromptOutput = {},
): ReadlinePrompt {
	const { errorLine, printLine } = resolveReadlinePromptOutput(output);
	const askQuestion: PromptQuestion = (query) =>
		new Promise<string>((resolve) => {
			rl.question(query, resolve);
		});

	return {
		async text(message: string, defaultValue: string, validate?: ValidateInput): Promise<string> {
			while (true) {
				const value = normalizePromptAnswer(
					await askQuestion(formatTextPrompt(message, defaultValue)),
				) || defaultValue;
				if (validate) {
					const result = validate(value);
					if (result !== true) {
						errorLine(formatValidationError(message, result, defaultValue));
						continue;
					}
				}

				return value;
			}
		},
		async select<T extends string>(
			message: string,
			options: PromptOption<T>[],
			defaultValue = 1,
		): Promise<T> {
			if (options.length === 0) {
				throw new Error(`select() requires at least one option for prompt: ${message}`);
			}

			const resolvedDefaultIndex = getResolvedDefaultIndex(options, defaultValue);
			renderSelectPrompt(message, options, resolvedDefaultIndex, printLine);

			while (true) {
				const answer = normalizePromptAnswer(
					await askQuestion(formatChoicePrompt(resolvedDefaultIndex)),
				);

				if (answer.length === 0) {
					return options[resolvedDefaultIndex].value;
				}

				const selection = resolvePromptSelection(options, answer);
				if (selection) {
					return selection.value;
				}

				if (isPromptHelpToken(answer)) {
					renderSelectPrompt(message, options, resolvedDefaultIndex, printLine);
					continue;
				}

				errorLine(formatInvalidSelectionError(answer, options, resolvedDefaultIndex));
			}
		},
		close(): void {
			rl.close();
		},
	};
}

function resolveReadlinePromptOutput({
	errorLine,
	printLine,
}: ReadlinePromptOutput): Required<ReadlinePromptOutput> {
	return {
		errorLine: errorLine ?? writePromptErrorLine,
		printLine: printLine ?? writePromptLine,
	};
}

function writePromptLine(line: string): void {
	process.stdout.write(`${line}\n`);
}

function writePromptErrorLine(line: string): void {
	process.stderr.write(`${line}\n`);
}

function normalizePromptAnswer(value: string): string {
	return String(value).trim();
}

function normalizePromptToken(value: string): string {
	return value.trim().toLowerCase();
}

function getResolvedDefaultIndex<T extends string>(
	options: PromptOption<T>[],
	defaultValue: number,
): number {
	const candidateIndex = Number.isInteger(defaultValue) ? defaultValue - 1 : -1;
	return options[candidateIndex] ? candidateIndex : 0;
}

function formatTextPrompt(message: string, defaultValue: string): string {
	const suffix = defaultValue.length > 0 ? ` [default: ${defaultValue}]` : "";
	return `${message}${suffix}: `;
}

function formatValidationError(
	message: string,
	result: boolean | string,
	defaultValue: string,
): string {
	const detail = typeof result === "string" ? result : "Invalid input";
	const retryHint =
		defaultValue.length > 0 ? ` Press Enter to keep "${defaultValue}".` : "";
	return `❌ ${message}: ${detail}.${retryHint}`;
}

function formatChoicePrompt(defaultIndex: number): string {
	return `Choice [default: ${defaultIndex + 1}, ? for options]: `;
}

function renderSelectPrompt<T extends string>(
	message: string,
	options: PromptOption<T>[],
	defaultIndex: number,
	printLine: PromptLinePrinter,
): void {
	printLine(message);
	printLine(
		"  Enter a number, option label, or option value. Press Enter to keep the default, or type ? to list choices again.",
	);
	options.forEach((option, index) => {
		const defaultMarker = index === defaultIndex ? " (default)" : "";
		const valueHint =
			normalizePromptToken(option.label) === normalizePromptToken(option.value)
				? ""
				: ` [${option.value}]`;
		printLine(`  ${index + 1}. ${option.label}${valueHint}${defaultMarker}`);
		if (option.hint) {
			printLine(`     ${option.hint}`);
		}
	});
}

function isPromptHelpToken(answer: string): boolean {
	const normalized = normalizePromptToken(answer);
	return normalized === "?" || normalized === "help" || normalized === "list";
}

function resolvePromptSelection<T extends string>(
	options: PromptOption<T>[],
	answer: string,
): PromptOption<T> | undefined {
	const numericChoice = Number(answer);
	if (!Number.isNaN(numericChoice) && options[numericChoice - 1]) {
		return options[numericChoice - 1];
	}

	const normalizedAnswer = normalizePromptToken(answer);
	return options.find((option) => {
		const normalizedLabel = normalizePromptToken(option.label);
		const normalizedValue = normalizePromptToken(option.value);
		return normalizedAnswer === normalizedLabel || normalizedAnswer === normalizedValue;
	});
}

function formatInvalidSelectionError<T extends string>(
	answer: string,
	options: PromptOption<T>[],
	defaultIndex: number,
): string {
	const optionValues = options.map((option) => option.value).join(", ");
	return [
		`❌ Invalid selection: ${answer}.`,
		`Enter 1-${options.length}, one of: ${optionValues},`,
		`or press Enter for "${options[defaultIndex].label}".`,
	].join(" ");
}
