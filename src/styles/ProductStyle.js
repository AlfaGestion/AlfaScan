import { StyleSheet } from "react-native";
import Colors from "./Colors";
import { moderateScale, horizontalScale, verticalScale } from "../utils/Metrics";

const productScreenStyles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    alignContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    textAlign: "center",
  },
  container: {
    paddingHorizontal: 20,
    width: "100%",
  },
  text: {
    textAlign: "center",
    fontSize: moderateScale(17),
  },
  image: {
    width: 50,
    height: 50,
    marginVertical: 10,
  },
  webImage: {
    width: 100,
    height: 100,
    marginVertical: 10,
  },
  buttonStock: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 5,
    padding: 10,
    height: 40,
    marginHorizontal: 10,
    marginVertical: 10,
    backgroundColor: Colors.LBLUE,
  },
  buttonModifyStock: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 5,
    padding: 10,
    height: 40,
    marginHorizontal: 10,
    marginVertical: 20,
    backgroundColor: Colors.DGREEN,
    marginBottom: 20,
  },
  buttonReloadImage: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 5,
    padding: 10,
    // height: 40,
    marginHorizontal: 10,
    marginTop: 10,
    // marginVertical: 20,
    backgroundColor: Colors.DBLUE,

  },
  textButton: {
    color: Colors.WHITE,
    marginLeft: 10,
  },
  innerText: {
    width: "100%",
    fontSize: moderateScale(16),
    textAlign: "center",
  }
});

const listProductsStyles = StyleSheet.create({
  loader: {
    padding: 30,
  },
  viewSearch: {
    paddingHorizontal: 10,
    marginVertical: 15,
  },
  textSearch: {
    backgroundColor: Colors.WHITE,
    padding: 5,
    borderColor: Colors.GREY,
    borderRadius: 10,
  },
  btnDownloadPrices: {
    backgroundColor: Colors.GREEN,
    paddingHorizontal: 20,
    paddingVertical: 10,
    margin: 10,
    borderRadius: 10,
  },
  textDownloadPrice: {
    fontSize: 15,
    textAlign: "center",
    color: Colors.WHITE,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 15,
    margin: 10,
  },
});

const stockScreenStyles = StyleSheet.create({
  container: {
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  containerTitle: {
    textAlign: "center",
    marginVertical: 20,
  },
  title: {
    textAlign: "center",
    fontSize: moderateScale(18),
  },
  titleName: {
    textAlign: "center",
    fontSize: moderateScale(19),
  },
  image: {
    width: 60,
    height: 60,
  },
  labelError: {
    color: Colors.RED,
  },
});

export { productScreenStyles, listProductsStyles, stockScreenStyles };
