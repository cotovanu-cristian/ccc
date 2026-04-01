export const isTmuxAvailable = () => Boolean(process.env.TMUX);

export const getTmuxPane = () => process.env.TMUX_PANE || undefined;
