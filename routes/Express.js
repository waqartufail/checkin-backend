app.delete("/admin/clear-db", async (req, res) => {
    try {
        await User.deleteMany({});
        await CheckInOut.deleteMany({});
        res.json({ message: "Database cleared successfully!" });
    } catch (error) {
        console.error("Error clearing database:", error);
        res.status(500).json({ error: "Failed to clear database" });
    }
});
