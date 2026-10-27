import reportsService from "../services/reports.service.js";

export const getReportsSummary = async (req, res, next) => {
  try {
    const data = await reportsService.getReportsSummary({
      companyId: req.companyId,
      userId: req.userId,
      userRole: req.userRole,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export default { getReportsSummary };
