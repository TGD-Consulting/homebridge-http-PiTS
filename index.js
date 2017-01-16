/*
 * Homebridge-Plugin for PiTS-Sensors (temperature, humidity, air/pressure)
 *
 * Sensor Request example URL:
 * http://192.168.0.10:8080/cgi-bin/homebridge.html?sensor=76&type=temperature
 *
 * Sensor returns 
 * {"value":"55.6"}
 *
 * License: MIT
 * 
 * (C) TGD, 2017
 */

var Service, Characteristic;
var request = require('request');

var temperatureService;
var humidityService;
var url
var humidity = 0;
var temperature = 0;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    ////////////////////////////// Custom characteristics //////////////////////////////
    EveAirPressure = function() {
        //todo: only rough guess of extreme values -> use correct min/max if known
        Characteristic.call(this, 'Eve AirPressure', 'E863F10F-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: "hPa",
            maxValue: 1085,
            minValue: 870,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(EveAirPressure, Characteristic);

    EveWeatherService = function(displayName, subtype) {
        Service.call(this, displayName, 'E863F001-079E-48FF-8F27-9C2605A29F52', subtype);
        // Required Characteristics
        this.addCharacteristic(Characteristic.CurrentTemperatureEveAirPressure);
        // Optional Characteristics
        this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
        this.addOptionalCharacteristic(EveAirPressure);
    };
    inherits(EveWeatherService, Service);

    homebridge.registerAccessory(
                "homebridge-httpPiTS",  // PluginName
                "HttpPiTS",             // accessoryName
                HttpPiTS                // constructor
    );
}

// Get data from config file 
function HttpPiTS(log, config) {
    this.log = log;
	this.debug = config["debug"] || false;
	this.debug && this.log('HttpPiTS: reading config');

    // url info
    this.url = config["url"];
    this.http_method = config["http_method"] || "GET";
    this.name = config["name"];
    this.manufacturer = config["manufacturer"] || "TGD-Consulting";
    this.model = config["model"] || "PiTS-It!";
    this.serial = config["serial"] || "PiTS Serial";
    this.humidity = config["humidity"];
    this.pressure = config["pressure"];

	this.temperatureService;
	this.humidityService;
}

HttpPiTS.prototype = {

    httpRequest: function (url, method, callback) {
		this.debug && this.log('httpRequest: '+method+' '+url);
        request({
                    uri: url,
                    method: method,
                    rejectUnauthorized: false
                },
                function (error, response, body) {
                    callback(error, response, body)
                })
    },

    getStateHumidity: function(callback){
	callback(null, this.humidity);
    },

    getState: function (callback) {
        var body;

	var res = request(this.http_method, this.url, {});
	if(res.statusCode > 400){
	  this.log('HTTP power function failed');
	  callback(error);
	} else {
	  this.log('HTTP power function succeeded!');
          var info = JSON.parse(res.body);

          temperatureService.setCharacteristic(Characteristic.CurrentTemperature, info.temperature);
          if(this.humidity !== false)
            humidityService.setCharacteristic(Characteristic.CurrentRelativeHumidity, info.humidity);

          this.log(res.body);
          this.log(info);

          this.temperature = info.temperature;
          if(this.humidity !== false)
            this.humidity = info.humidity;

	  callback(null, this.temperature);
	}
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        this.debug && this.log("getServices");
        var services = [],
            informationService = new Service.AccessoryInformation();

        informationService
                .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                .setCharacteristic(Characteristic.Model, this.model)
                .setCharacteristic(Characteristic.SerialNumber, this.serial);
        services.push(informationService);

        temperatureService = new Service.TemperatureSensor(this.name);
        temperatureService
                .getCharacteristic(Characteristic.CurrentTemperature)
                .on('get', this.getState.bind(this));
        services.push(temperatureService);

        if(this.humidity !== false){
          humidityService = new Service.HumiditySensor(this.name);
          humidityService
                  .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                  .setProps({minValue: -100, maxValue: 100})
                  .on('get', this.getStateHumidity.bind(this));
          services.push(humidityService);
        }

        return services;
    }
};
